.PHONY: build dev-frontend dev-backend clean

build:
	cd frontend && pnpm install && pnpm build
	go build -o diffdragon .

dev-frontend:
	cd frontend && pnpm dev

dev-backend:
	go run . --base main --ai claude

clean:
	rm -f diffdragon
	rm -rf static/assets static/index.html
