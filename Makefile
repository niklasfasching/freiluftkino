.PHONY: install
install:
	go install github.com/niklasfasching/headless/cmd/headless@latest
	pip3 install GitPython

.PHONY: run
run:
	~/go/bin/headless -b "--disable-web-security" -fs -c "$$(cat scrape.mjs)"
	python3 post_process.py
