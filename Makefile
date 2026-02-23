.PHONY: build dev-frontend dev-backend macos linux clean

BINDIR ?= /usr/local/bin
SERVICE ?= diffdragon
SYSTEMD_USER_DIR ?= $(HOME)/.config/systemd/user

build:
	cd frontend && pnpm install && pnpm build
	go build -o diffdragon .

dev-frontend:
	cd frontend && pnpm dev

dev-backend:
	go run . --base main --ai claude

macos: build
	sudo install -m 755 ./diffdragon $(BINDIR)/diffdragon
	sudo install -m 755 ./scripts/diffdragon-lmstudio $(BINDIR)/diffdragon-lmstudio
	@echo "Installed to $(BINDIR). On macOS, use launchd or manually run the app."

linux: build
	sudo install -m 755 ./diffdragon $(BINDIR)/diffdragon
	sudo install -m 755 ./scripts/diffdragon-lmstudio $(BINDIR)/diffdragon-lmstudio
	mkdir -p $(SYSTEMD_USER_DIR)
	printf '%s\n' '[Unit]' 'Description=DiffDragon local service (LM Studio)' '' '[Service]' 'ExecStart=$(BINDIR)/diffdragon-lmstudio' 'Restart=on-failure' 'RestartSec=2' '' '[Install]' 'WantedBy=default.target' > $(SYSTEMD_USER_DIR)/$(SERVICE).service
	systemctl --user daemon-reload
	systemctl --user enable --now $(SERVICE)
	systemctl --user --no-pager --lines=6 status $(SERVICE)

clean:
	rm -f diffdragon
	rm -rf static/assets static/index.html
