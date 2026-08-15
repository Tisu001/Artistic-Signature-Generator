package main

import (
	"io"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestIsAllowedLocalURL(t *testing.T) {
	tests := []struct {
		raw  string
		want bool
	}{
		{"http://localhost", true},
		{"http://localhost/", true},
		{"http://localhost:8080", true},
		{"http://localhost:8080/path?x=1", true},
		{"http://127.0.0.1", true},
		{"http://127.0.0.1/", true},
		{"http://127.0.0.1:3000", true},
		{"http://127.0.0.1:3000/a/b?c=d", true},

		{"", false},
		{"localhost", false},
		{"ftp://localhost", false},
		{"https://localhost", false},
		{"http://example.com", false},
		{"http://192.168.1.1", false},
		{"http://[::1]", false},
		{"http://localhost:abc", false},
		{"http://localhost@evil.com", false},
		{"http://localhost:8080@evil.com", false},
		{"http://127.0.0.1@evil.com", false},
		{"http://127.0.0.1:8080@evil.com", false},
		{"http://evil.com/localhost", false},
	}

	for _, tc := range tests {
		t.Run(tc.raw, func(t *testing.T) {
			if got := isAllowedLocalURL(tc.raw); got != tc.want {
				t.Errorf("isAllowedLocalURL(%q) = %v, want %v", tc.raw, got, tc.want)
			}
		})
	}
}

func TestGetAppDir(t *testing.T) {
	tests := []struct {
		exePath string
		want    string
	}{
		{`C:\app\艺术签名生成器.exe`, `C:\app\app`},
		{`C:\app\sub\艺术签名生成器.exe`, `C:\app\sub\app`},
		{`D:\tools\launcher.exe`, `D:\tools\app`},
	}

	for _, tc := range tests {
		if got := getAppDir(tc.exePath); got != tc.want {
			t.Errorf("getAppDir(%q) = %q, want %q", tc.exePath, got, tc.want)
		}
	}
}

func TestCheckAppDir(t *testing.T) {
	t.Run("app 目录存在", func(t *testing.T) {
		dir := t.TempDir()
		exePath := filepath.Join(dir, "launcher.exe")
		appDir := filepath.Join(dir, "app")
		if err := os.Mkdir(appDir, 0755); err != nil {
			t.Fatal(err)
		}

		got, err := checkAppDir(exePath)
		if err != nil {
			t.Fatalf("checkAppDir() error = %v", err)
		}
		if got != appDir {
			t.Errorf("checkAppDir() = %q, want %q", got, appDir)
		}
	})

	t.Run("app 目录不存在", func(t *testing.T) {
		dir := t.TempDir()
		exePath := filepath.Join(dir, "launcher.exe")

		if _, err := checkAppDir(exePath); err == nil {
			t.Fatal("checkAppDir() expected error, got nil")
		}
	})
}

type fakeConn struct {
	data   []byte
	closed bool
}

func (f *fakeConn) Read(p []byte) (int, error) {
	if len(f.data) == 0 {
		return 0, io.EOF
	}
	n := copy(p, f.data)
	f.data = f.data[n:]
	return n, nil
}

func (f *fakeConn) Write(p []byte) (int, error) {
	return len(p), nil
}

func (f *fakeConn) Close() error {
	f.closed = true
	return nil
}

func TestHandlePipeConn(t *testing.T) {
	t.Run("OPEN 命令", func(t *testing.T) {
		conn := &fakeConn{data: []byte("OPEN\n")}
		openPageCh := make(chan struct{}, 1)

		handlePipeConn(conn, openPageCh)

		if !conn.closed {
			t.Error("handlePipeConn() should close connection")
		}

		select {
		case <-openPageCh:
		case <-time.After(100 * time.Millisecond):
			t.Error("handlePipeConn() should send to openPageCh for OPEN")
		}
	})

	t.Run("非 OPEN 命令", func(t *testing.T) {
		conn := &fakeConn{data: []byte("PING\n")}
		openPageCh := make(chan struct{}, 1)

		handlePipeConn(conn, openPageCh)

		if !conn.closed {
			t.Error("handlePipeConn() should close connection")
		}

		select {
		case <-openPageCh:
			t.Error("handlePipeConn() should not send to openPageCh for non-OPEN")
		case <-time.After(50 * time.Millisecond):
		}
	})

	t.Run("读失败", func(t *testing.T) {
		conn := &fakeConn{data: nil}
		openPageCh := make(chan struct{}, 1)

		handlePipeConn(conn, openPageCh)

		if !conn.closed {
			t.Error("handlePipeConn() should close connection")
		}

		select {
		case <-openPageCh:
			t.Error("handlePipeConn() should not send to openPageCh on read error")
		case <-time.After(50 * time.Millisecond):
		}
	})
}
