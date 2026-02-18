package main

import (
	"errors"
	"fmt"
	"os/exec"
	"runtime"
	"strings"
)

var errFolderPickerCanceled = errors.New("folder picker canceled")

type pickerCommand struct {
	name string
	args []string
}

func pickFolderPath() (string, error) {
	commands := pickerCommandsForCurrentOS()
	if len(commands) == 0 {
		return "", fmt.Errorf("native folder picker is not supported on %s", runtime.GOOS)
	}

	var available []pickerCommand
	for _, command := range commands {
		if _, err := exec.LookPath(command.name); err == nil {
			available = append(available, command)
		}
	}

	if len(available) == 0 {
		return "", fmt.Errorf("no native folder picker found (install zenity or kdialog)")
	}

	for _, command := range available {
		path, err := runPickerCommand(command)
		if err == nil {
			return path, nil
		}
		if errors.Is(err, errFolderPickerCanceled) {
			return "", err
		}
	}

	return "", fmt.Errorf("failed to open native folder picker")
}

func pickerCommandsForCurrentOS() []pickerCommand {
	switch runtime.GOOS {
	case "darwin":
		return []pickerCommand{{
			name: "osascript",
			args: []string{"-e", `POSIX path of (choose folder with prompt "Select a Git repository")`},
		}}
	case "windows":
		return []pickerCommand{{
			name: "powershell",
			args: []string{
				"-NoProfile",
				"-Command",
				"Add-Type -AssemblyName System.Windows.Forms; $dialog = New-Object System.Windows.Forms.FolderBrowserDialog; if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Write($dialog.SelectedPath) }",
			},
		}}
	default:
		return []pickerCommand{
			{
				name: "zenity",
				args: []string{"--file-selection", "--directory", "--title=Select a Git repository"},
			},
			{
				name: "kdialog",
				args: []string{"--getexistingdirectory", ".", "Select a Git repository"},
			},
		}
	}
}

func runPickerCommand(command pickerCommand) (string, error) {
	out, err := exec.Command(command.name, command.args...).CombinedOutput()
	output := strings.TrimSpace(string(out))
	if err != nil {
		if output == "" {
			return "", errFolderPickerCanceled
		}
		return "", err
	}
	if output == "" {
		return "", errFolderPickerCanceled
	}
	return output, nil
}
