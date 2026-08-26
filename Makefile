# Himitsu Protocol — build, deploy, and verification pipeline
# Copy .env.example to .env and set STARKNET_RPC_URL first. Never commit .env.

-include .env
export

POOL        := 0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a
DEPOSIT_SEL := 0x9149d2123147c5f43d258257fef0b7b969db78269369ebcf5ebb9eef8592f2
SCARB_VER   := 2.17.0
SNFORGE_VER := 0.59.0
VAULT       := $(shell test -f deployments/mainnet.json && python3 -c "import json;print(json.load(open('deployments/mainnet.json'))['vault'])" 2>/dev/null)

.PHONY: help setup doctor contracts-build contracts-test contracts-fmt vectors \
        declare deploy fund post-root epoch-close indexer-once indexer dashboard-data \
        app-install app-dev app-build verify-txs strk20-check wallet-help clean

help: ## List targets
	@grep -E '^[a-zA-Z_-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

setup: ## Install Cairo toolchain (scarb, snforge via starkup) + starkli
	command -v starkup >/dev/null 2>&1 || curl --proto '=https' --tlsv1.2 -sSf https://sh.starkup.dev | sh
	command -v starkli >/dev/null 2>&1 || (curl https://get.starkli.sh | sh && ~/.starkli/bin/starkliup)
	@echo ">> Pin versions in contracts/.tool-versions: scarb $(SCARB_VER) / starknet-foundry $(SNFORGE_VER)"
	@$(MAKE) doctor

doctor: ## Verify toolchain + env
	@for t in scarb snforge starkli node pnpm; do command -v $$t >/dev/null && echo "ok  $$t $$($$t --version 2>/dev/null | head -1)" || echo "MISSING $$t"; done
	@test -n "$(STARKNET_RPC_URL)" && echo "ok  STARKNET_RPC_URL set" || echo "MISSING STARKNET_RPC_URL (.env)"

contracts-build: ## Compile HimitsuVault
	cd contracts && scarb build

contracts-test: ## Run snforge tests (exports parity vectors)
	cd contracts && snforge test

contracts-fmt: ## Format Cairo
	cd contracts && scarb fmt

vectors: contracts-test ## Regenerate epochs/vectors.json (Cairo↔TS poseidon parity)
	@test -f epochs/vectors.json && echo "vectors ok" || (echo "tests must write epochs/vectors.json"; exit 1)

declare: contracts-build ## Declare class on mainnet (needs starkli account, see wallet-help)
	starkli declare contracts/target/dev/himitsu_vault_HimitsuVault.contract_class.json \
	  --rpc $(STARKNET_RPC_URL) --account $(STARKLI_ACCOUNT) --keystore $(STARKLI_KEYSTORE)

deploy: ## Deploy vault: make deploy CLASS_HASH=0x… OPERATOR=0x…
	starkli deploy $(CLASS_HASH) $(POOL) $(OPERATOR) \
	  --rpc $(STARKNET_RPC_URL) --account $(STARKLI_ACCOUNT) --keystore $(STARKLI_KEYSTORE)
	@echo ">> Write the address into deployments/mainnet.json {\"vault\": \"0x…\"} and strk20.json contracts[]"

fund: ## Fund a reward pot: make fund TOKEN=0x… AMOUNT=… (approve+fund via starkli invoke)
	starkli invoke $(TOKEN) approve $(VAULT) u256:$(AMOUNT) --rpc $(STARKNET_RPC_URL) --account $(STARKLI_ACCOUNT) --keystore $(STARKLI_KEYSTORE)
	starkli invoke $(VAULT) fund $(TOKEN) $(AMOUNT) --rpc $(STARKNET_RPC_URL) --account $(STARKLI_ACCOUNT) --keystore $(STARKLI_KEYSTORE)

epoch-close: ## Compute allocations + merkle for an epoch: make epoch-close EPOCH=1
	cd indexer && pnpm tsx src/epoch-close.ts --epoch $(EPOCH) --pool $(POOL) --vault $(VAULT)

post-root: ## Post an epoch root on-chain: make post-root EPOCH=1 ROOT=0x… VEST_START=… VEST_DUR=…
	starkli invoke $(VAULT) post_root $(EPOCH) $(ROOT) $(VEST_START) $(VEST_DUR) \
	  --rpc $(STARKNET_RPC_URL) --account $(STARKLI_ACCOUNT) --keystore $(STARKLI_KEYSTORE)

indexer-once: ## One indexing pass (deposits since pool genesis 8978970 + registrations)
	cd indexer && pnpm tsx src/index.ts --once --pool $(POOL) --deposit-sel $(DEPOSIT_SEL) --vault $(VAULT)

indexer: ## Continuous indexing (30s poll)
	cd indexer && pnpm tsx src/index.ts --watch --pool $(POOL) --deposit-sel $(DEPOSIT_SEL) --vault $(VAULT)

dashboard-data: indexer-once ## Refresh depth-per-bucket data for the app
	cd indexer && pnpm tsx src/dashboard.ts

app-install: ## Install app deps (pinned: starknet 10.4.0, get-starknet 6.0.2)
	cd app && pnpm install

app-dev: ## Run the dapp locally
	cd app && pnpm dev

app-build: ## Production build
	cd app && pnpm build

verify-txs: ## Re-verify every strk20.json tx against mainnet RPC (exists, SUCCEEDED, pool + vault events)
	pnpm --dir indexer tsx src/verify-txs.ts --strk20 ../strk20.json --pool $(POOL) --vault $(VAULT)

strk20-check: ## Sanity-check strk20.json shape + required fields before the freeze
	@python3 -c "import json;d=json.load(open('strk20.json'));assert set(d)>= {'transactions','contracts','demo_video','demo_url'};print('txs:',len(d['transactions']),'contracts:',len(d['contracts']),'video:',bool(d['demo_video']))"

wallet-help: ## Print starkli account/keystore bootstrap commands
	@echo "starkli signer keystore from-key ~/.starkli/himitsu_key.json   # paste deployer private key"
	@echo "starkli account fetch <DEPLOYER_ADDRESS> --rpc \$$STARKNET_RPC_URL --output ~/.starkli/himitsu_acct.json"
	@echo "export STARKLI_KEYSTORE=~/.starkli/himitsu_key.json STARKLI_ACCOUNT=~/.starkli/himitsu_acct.json  # put in .env"

clean: ## Remove build artifacts
	rm -rf contracts/target app/.next indexer/dist
