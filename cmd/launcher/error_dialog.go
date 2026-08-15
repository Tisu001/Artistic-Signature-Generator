package main

import (
	"fmt"
	"os"
	"syscall"
	"unsafe"
)

const mbIconError = 0x00000010

func showErrorDialog(title, message string) {
	user32 := syscall.NewLazyDLL("user32.dll")
	proc := user32.NewProc("MessageBoxW")
	titlePtr, _ := syscall.UTF16PtrFromString(title)
	msgPtr, _ := syscall.UTF16PtrFromString(message)
	proc.Call(
		0,
		uintptr(unsafe.Pointer(msgPtr)),
		uintptr(unsafe.Pointer(titlePtr)),
		uintptr(mbIconError),
	)
}

func fatalError(err error) {
	showErrorDialog("启动失败", err.Error())
	os.Exit(1)
}

func fatalErrorf(format string, args ...any) {
	showErrorDialog("启动失败", fmt.Sprintf(format, args...))
	os.Exit(1)
}
