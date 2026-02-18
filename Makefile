.PHONY: build dev-frontend dev-backend release-service-update clean

BINDIR ?= /usr/local/bin
SERVICE ?= diffdragon

build:
	cd frontend && pnpm install && pnpm build
	go build -o diffdragon .

dev-frontend:
	cd frontend && pnpm dev

dev-backend:
	go run . --base main --ai claude

release-service-update: build
	sudo install -m 755 ./diffdragon $(BINDIR)/diffdragon
	systemctl --user daemon-reload
	systemctl --user restart $(SERVICE)
	systemctl --user --no-pager --lines=3 status $(SERVICE)

clean:
	rm -f diffdragon
	rm -rf static/assets static/index.html
