// 艺术签名生成器 - Windows 便携启动器
// 负责：启动本地 HTTP 服务、系统托盘、单实例 IPC、打开系统浏览器
package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"syscall"
	"time"
	"unsafe"

	"github.com/getlantern/systray"
)

const appName = "艺术签名生成器"
const mutexNamePrefix = "Local\\ArtisticSignatureGenerator-"
const pipeNamePrefix = `\\.\pipe\ArtisticSignatureGenerator-`

func main() {
	openURL := flag.String("open-url", "", "仅打开指定 URL，不启动本地服务（仅限 localhost/127.0.0.1）")
	flag.Parse()

	if *openURL != "" {
		if !isAllowedLocalURL(*openURL) {
			log.Fatalf("--open-url 仅允许 http://localhost 或 http://127.0.0.1 地址")
		}
		runTrayOnly(*openURL)
		return
	}

	// 基于 exe 目录定位 app/，不依赖工作目录
	exePath, err := os.Executable()
	if err != nil {
		log.Fatalf("无法获取程序路径: %v", err)
	}
	exeDir := filepath.Dir(exePath)
	appDir := filepath.Join(exeDir, "app")

	if _, err := os.Stat(appDir); os.IsNotExist(err) {
		log.Fatalf("未找到应用目录: %s\n请确保 app/ 文件夹与 %s.exe 在同一目录。", appDir, appName)
	}

	userSID, err := currentUserSID()
	if err != nil {
		log.Fatalf("无法获取用户 SID: %v", err)
	}
	mutexName := mutexNamePrefix + userSID
	pipeName := pipeNamePrefix + userSID

	// 尝试创建命名互斥体；若已存在则向首个实例发送 OPEN 指令后退出
	mutex, alreadyRunning, err := acquireMutex(mutexName)
	if err != nil {
		log.Fatalf("互斥体创建失败: %v", err)
	}
	if alreadyRunning {
		if err := sendOpenCommand(pipeName); err != nil {
			//  fallback：直接打开浏览器访问本地常见端口（无法精确知道端口）
			log.Printf("无法通知已有实例: %v", err)
		}
		return
	}
	defer releaseMutex(mutex)

	// 监听 127.0.0.1:0，由系统分配空闲端口
	listener, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		log.Fatalf("无法绑定端口: %v", err)
	}
	port := listener.Addr().(*net.TCPAddr).Port
	baseURL := fmt.Sprintf("http://127.0.0.1:%d", port)

	// 静态文件服务
	fs := http.FileServer(http.Dir(appDir))
	server := &http.Server{
		Handler:     fs,
		ReadTimeout: 5 * time.Second,
	}

	// 启动顺序：端口绑定成功 -> HTTP 服务 -> 命名管道服务器 -> 托盘 -> 浏览器
	go func() {
		if err := server.Serve(listener); err != nil && err != http.ErrServerClosed {
			log.Printf("HTTP 服务异常: %v", err)
		}
	}()

	// 在主 goroutine 中同步创建命名管道，确保后续实例通知时管道已就绪
	pipeCtx, pipeCancel := context.WithCancel(context.Background())
	defer pipeCancel()
	openPageCh := make(chan struct{}, 1)
	if err := runPipeServer(pipeCtx, pipeName, openPageCh); err != nil {
		log.Fatalf("命名管道监听失败: %v", err)
	}

	// 托盘与浏览器打开都在 systray.Run 中完成
	systray.Run(func() {
		onReady(baseURL, openPageCh)
	}, func() {
		onExit(server, pipeCancel)
	})
}

func onReady(baseURL string, openPageCh <-chan struct{}) {
	setIcon()
	systray.SetTitle(appName)
	systray.SetTooltip(appName + " - 点击打开页面")

	mOpen := systray.AddMenuItem("打开页面", "在浏览器中打开")
	mQuit := systray.AddMenuItem("退出", "关闭服务并退出")

	if err := openBrowser(baseURL); err != nil {
		log.Printf("打开浏览器失败: %v", err)
	}

	for {
		select {
		case <-mOpen.ClickedCh:
			if err := openBrowser(baseURL); err != nil {
				log.Printf("打开浏览器失败: %v", err)
			}
		case <-openPageCh:
			if err := openBrowser(baseURL); err != nil {
				log.Printf("打开浏览器失败: %v", err)
			}
		case <-mQuit.ClickedCh:
			systray.Quit()
			return
		}
	}
}

func onExit(server *http.Server, pipeCancel context.CancelFunc) {
	pipeCancel()
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	if err := server.Shutdown(ctx); err != nil {
		log.Printf("HTTP 服务关闭异常: %v", err)
	}
}

const swShownormal = 1

func openBrowser(targetURL string) error {
	shell32 := syscall.NewLazyDLL("shell32.dll")
	proc := shell32.NewProc("ShellExecuteW")

	verbPtr, err := syscall.UTF16PtrFromString("open")
	if err != nil {
		return err
	}
	urlPtr, err := syscall.UTF16PtrFromString(targetURL)
	if err != nil {
		return err
	}

	ret, _, _ := proc.Call(
		0,
		uintptr(unsafe.Pointer(verbPtr)),
		uintptr(unsafe.Pointer(urlPtr)),
		0,
		0,
		uintptr(swShownormal),
	)
	if ret <= 32 {
		return fmt.Errorf("ShellExecuteW 失败，错误码: %d", ret)
	}
	return nil
}

func isAllowedLocalURL(raw string) bool {
	u, err := url.Parse(raw)
	if err != nil {
		return false
	}
	if u.Scheme != "http" {
		return false
	}
	// 禁止 http://localhost@evil.com 这类带用户信息的 URL
	if u.User != nil {
		return false
	}
	host := u.Hostname()
	if host != "localhost" && host != "127.0.0.1" {
		return false
	}
	if port := u.Port(); port != "" {
		if _, err := strconv.Atoi(port); err != nil {
			return false
		}
	}
	return true
}

func runTrayOnly(url string) {
	systray.Run(func() {
		setIcon()
		systray.SetTitle(appName)
		systray.SetTooltip(appName)
		mOpen := systray.AddMenuItem("打开页面", "在浏览器中打开")
		mQuit := systray.AddMenuItem("退出", "退出")
		if err := openBrowser(url); err != nil {
			log.Printf("打开浏览器失败: %v", err)
		}
		for {
			select {
			case <-mOpen.ClickedCh:
				if err := openBrowser(url); err != nil {
					log.Printf("打开浏览器失败: %v", err)
				}
			case <-mQuit.ClickedCh:
				systray.Quit()
				return
			}
		}
	}, func() {})
}
