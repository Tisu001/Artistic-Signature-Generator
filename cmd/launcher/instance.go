package main

import (
	"context"
	"io"
	"log"
	"strings"
	"syscall"
	"time"
	"unsafe"

	"github.com/microsoft/go-winio"
	"golang.org/x/sys/windows"
)

func currentUserSID() (string, error) {
	token := windows.GetCurrentProcessToken()
	user, err := token.GetTokenUser()
	if err != nil {
		return "", err
	}
	return user.User.Sid.String()
}

func acquireMutex(name string) (syscall.Handle, bool, error) {
	namePtr, err := syscall.UTF16PtrFromString(name)
	if err != nil {
		return 0, false, err
	}
	handle, _, err := procCreateMutexW.Call(0, 1, uintptr(unsafe.Pointer(namePtr)))
	if handle == 0 {
		return 0, false, err
	}
	alreadyExists := err == syscall.ERROR_ALREADY_EXISTS
	return syscall.Handle(handle), alreadyExists, nil
}

func releaseMutex(handle syscall.Handle) {
	if handle != 0 {
		syscall.CloseHandle(handle)
	}
}

func sendOpenCommand(pipeName string) error {
	var lastErr error
	// 对“管道尚不存在”做短暂重试，避免首实例还没创建好管道就退出
	for i := 0; i < 10; i++ {
		if i > 0 {
			time.Sleep(50 * time.Millisecond)
		}
		conn, err := winio.DialPipe(pipeName, &winio.PipeDialTimeout{Timeout: 2 * time.Second})
		if err != nil {
			lastErr = err
			continue
		}
		defer conn.Close()
		_, err = conn.Write([]byte("OPEN\n"))
		return err
	}
	return lastErr
}

func runPipeServer(ctx context.Context, pipeName string, openPageCh chan<- struct{}) error {
	listener, err := winio.ListenPipe(pipeName, nil)
	if err != nil {
		return err
	}

	go func() {
		<-ctx.Done()
		listener.Close()
	}()

	go func() {
		for {
			conn, err := listener.Accept()
			if err != nil {
				if ctx.Err() != nil {
					return
				}
				log.Printf("命名管道接受连接失败: %v", err)
				continue
			}
			go handlePipeConn(conn, openPageCh)
		}
	}()

	return nil
}

func handlePipeConn(conn io.ReadWriteCloser, openPageCh chan<- struct{}) {
	defer conn.Close()
	buf := make([]byte, 128)
	n, err := conn.Read(buf)
	if err != nil {
		return
	}
	msg := strings.TrimSpace(string(buf[:n]))
	if msg == "OPEN" {
		select {
		case openPageCh <- struct{}{}:
		default:
		}
	}
}

var procCreateMutexW = syscall.NewLazyDLL("kernel32.dll").NewProc("CreateMutexW")
