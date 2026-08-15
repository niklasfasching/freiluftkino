.PHONY: install
install:
	go install github.com/niklasfasching/headless/cmd/headless@latest

.PHONY: ui
ui:
	python3 -m http.server -d docs 8000

.PHONY: run
run:
	~/go/bin/headless -b "--disable-web-security" -fs -c "$$(cat scrape.mjs)"
	python3 post_process.py
