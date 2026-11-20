HERDR_DIR := $(HOME)/.config/herdr-app
FILES := keys.json settings.json programs.json $(wildcard layouts/*.json)
MODS := $(notdir $(wildcard mods/*))

.PHONY: install
# Herdr's installer creates $(HERDR_DIR) and its shipped mods; this only links ours on top.
install:
	mkdir -p $(HERDR_DIR)/layouts $(HERDR_DIR)/mods
	$(foreach f,$(FILES),ln -sfn $(CURDIR)/$(f) $(HERDR_DIR)/$(f);)
	$(foreach m,$(MODS),ln -sfn $(CURDIR)/mods/$(m) $(HERDR_DIR)/mods/$(m);)
