HERDR_DIR := $(HOME)/.config/herdr-app
FILES := keys.json settings.json programs.json $(wildcard layouts/*.json)
MODS := $(notdir $(wildcard mods/*))

.DEFAULT_GOAL := help
.PHONY: help install uninstall

help: ## Show this help
	@awk 'BEGIN {FS = ":.*## "} /^[a-zA-Z_-]+:.*## / {printf "  %-10s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

# Herdr's installer creates $(HERDR_DIR) and its shipped mods; this only links ours on top.
install: ## Link config, layouts and mods into ~/.config/herdr-app
	@mkdir -p $(HERDR_DIR)/layouts $(HERDR_DIR)/mods
	@echo "Installing into $(HERDR_DIR)"
	@for p in $(FILES) $(addprefix mods/,$(MODS)); do \
		src="$(CURDIR)/$$p"; dst="$(HERDR_DIR)/$$p"; old="$$(readlink "$$dst")"; \
		if [ "$$old" = "$$src" ]; then status="unchanged"; note=""; \
		elif [ -L "$$dst" ]; then status="relinked"; note=" (was -> $$old)"; \
		elif [ -e "$$dst" ]; then status="replaced"; note=" (was a regular file)"; \
		else status="linked"; note=""; fi; \
		ln -sfn "$$src" "$$dst" && printf '  %-10s %s%s\n' "$$status" "$$p" "$$note"; \
	done

# Removes only links that point into this checkout, so Herdr's own files and mods stay.
uninstall: ## Remove the links that install created
	@$(foreach p,$(FILES) $(addprefix mods/,$(MODS)),[ "$$(readlink $(HERDR_DIR)/$(p))" = "$(CURDIR)/$(p)" ] && rm -v $(HERDR_DIR)/$(p);) true
