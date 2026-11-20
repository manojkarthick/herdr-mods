HERDR_DIR := $(HOME)/.config/herdr-app
FILES := keys.json settings.json programs.json $(wildcard layouts/*.json)
MODS := $(notdir $(wildcard mods/*))

.DEFAULT_GOAL := help
.PHONY: help install

help: ## Show this help
	@awk 'BEGIN {FS = ":.*## "} /^[a-zA-Z_-]+:.*## / {printf "  %-10s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

# Herdr's installer creates $(HERDR_DIR) and its shipped mods; this only links ours on top.
install: ## Link config, layouts and mods into ~/.config/herdr-app
	mkdir -p $(HERDR_DIR)/layouts $(HERDR_DIR)/mods
	$(foreach f,$(FILES),ln -sfn $(CURDIR)/$(f) $(HERDR_DIR)/$(f);)
	$(foreach m,$(MODS),ln -sfn $(CURDIR)/mods/$(m) $(HERDR_DIR)/mods/$(m);)
