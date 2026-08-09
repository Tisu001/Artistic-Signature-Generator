package main

import (
	_ "embed"

	"github.com/getlantern/systray"
)

//go:embed app-icon.ico
var trayIconBytes []byte

func setIcon() {
	systray.SetIcon(trayIconBytes)
}
