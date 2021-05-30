.PHONY: run
run:
	headless -a "dev" -b "--disable-web-security" -fs -d scrape.mjs
