HERDR_DIR := $(HOME)/.config/herdr-app
FILES := keys.json settings.json programs.json $(wildcard layouts/*.json)
# Only folders with a mod.json: a removed mod leaves a folder behind holding just the files Herdr generated.
MODS := $(patsubst mods/%/mod.json,%,$(wildcard mods/*/mod.json))

.DEFAULT_GOAL := help
.PHONY: help install uninstall update

help: ## Show this help
	@awk 'BEGIN {FS = ":.*## "} /^[a-zA-Z_-]+:.*## / {printf "  %-10s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

# Herdr's installer creates $(HERDR_DIR) and its shipped mods; this only adds ours on top.
# Third-party mods go first: their installers may replace keys.json, which the links below restore.
install: ## Install the pinned third-party mods, then link config, layouts and mods into ~/.config/herdr-app
	@mkdir -p $(HERDR_DIR)/layouts $(HERDR_DIR)/mods
	@echo "Installing into $(HERDR_DIR)"
	@HERDR_DIR=$(HERDR_DIR) scripts/vendor.sh install
	@for p in $(FILES) $(addprefix mods/,$(MODS)); do \
		src="$(CURDIR)/$$p"; dst="$(HERDR_DIR)/$$p"; old="$$(readlink "$$dst")"; \
		if [ "$$old" = "$$src" ]; then status="unchanged"; note=""; \
		elif [ -L "$$dst" ]; then status="relinked"; note=" (was -> $$old)"; \
		elif [ -e "$$dst" ]; then status="replaced"; note=" (was a regular file)"; \
		else status="linked"; note=""; fi; \
		ln -sfn "$$src" "$$dst" && printf '  %-10s %s%s\n' "$$status" "$$p" "$$note"; \
	done

# Removes only links that point into this checkout, so Herdr's own files and mods stay.
uninstall: ## Remove the links that install created and the third-party mods it copied
	@$(foreach p,$(FILES) $(addprefix mods/,$(MODS)),[ "$$(readlink $(HERDR_DIR)/$(p))" = "$(CURDIR)/$(p)" ] && rm -v $(HERDR_DIR)/$(p);) true
	@HERDR_DIR=$(HERDR_DIR) scripts/vendor.sh uninstall

update: ## Move the third-party mod pins in vendor.json to their newest versions
	@scripts/vendor.sh update
