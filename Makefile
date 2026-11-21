HERDR_DIR := $(HOME)/.config/herdr-app
FILES := keys.json settings.json programs.json $(wildcard layouts/*.json)
MODS := $(notdir $(wildcard mods/*))

.DEFAULT_GOAL := help
.PHONY: help install uninstall

help: ## Show this help
	@awk 'BEGIN {FS = ":.*## "} /^[a-zA-Z_-]+:.*## / {printf "  %-10s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

# Herdr's installer creates $(HERDR_DIR) and its shipped mods; this only links ours on top.
install: ## Link config, layouts and mods into ~/.config/herdr-app
	mkdir -p $(HERDR_DIR)/layouts $(HERDR_DIR)/mods
	$(foreach f,$(FILES),ln -sfn $(CURDIR)/$(f) $(HERDR_DIR)/$(f);)
	$(foreach m,$(MODS),ln -sfn $(CURDIR)/mods/$(m) $(HERDR_DIR)/mods/$(m);)

# Removes only links that point into this checkout, so Herdr's own files and mods stay.
uninstall: ## Remove the links that install created
	@$(foreach p,$(FILES) $(addprefix mods/,$(MODS)),[ "$$(readlink $(HERDR_DIR)/$(p))" = "$(CURDIR)/$(p)" ] && rm -v $(HERDR_DIR)/$(p);) true
