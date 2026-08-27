# Himitsu Protocol — build, deploy, and verification pipeline
# Copy .env.example to .env and set STARKNET_RPC_URL first. Never commit .env.

-include .env
export

POOL        := 0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a
DEPOSIT_SEL := 0x9149d2123147c5f43d258257fef0b7b969db78269369ebcf5ebb9eef8592f2
SCARB_VER   := 2.20.1
SNFORGE_VER := 0.63.0
VAULT       := $(shell test -f deployments/mainnet.json && python3 -c "import json;print(json.load(open('deployments/mainnet.json'))['vault'])" 2>/dev/null)
# declare/deploy/fund/post-root use `sncast` (Starknet Foundry), not `starkli`: starkli 0.4.2
# (latest release) can't declare our current Sierra output — its bundled compiler rejects it,
# and feeding it Scarb's own CASM produces a class-hash mismatch against what live sequencers
# independently recompute. sncast ships from the same release train as scarb/snforge, so its
# CASM output matches. Confirmed end-to-end on Sepolia 2026-08-28. Account setup still uses
# starkli (wallet-help) — that path only worked fine since account-deploy doesn't compile
# anything, it deploys a pre-existing declared class. See wallet-help for importing that
# account into sncast too, which declare/deploy/fund/post-root need via SNCAST_ACCOUNT.

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
	@for t in scarb snforge sncast starkli node pnpm; do command -v $$t >/dev/null && echo "ok  $$t $$($$t --version 2>/dev/null | head -1)" || echo "MISSING $$t"; done
	@test -n "$(STARKNET_RPC_URL)" && echo "ok  STARKNET_RPC_URL set" || echo "MISSING STARKNET_RPC_URL (.env)"

contracts-build: ## Compile HimitsuVault
	cd contracts && scarb build

contracts-test: ## Run snforge tests (exports parity vectors to epochs/vectors.json)
	cd contracts && snforge test 2>&1 | python3 ../scripts/export_vectors.py

contracts-fmt: ## Format Cairo
	cd contracts && scarb fmt

vectors: contracts-test ## Regenerate epochs/vectors.json (Cairo↔TS poseidon parity)
	@test -f epochs/vectors.json && echo "vectors ok" || (echo "tests must write epochs/vectors.json"; exit 1)

declare: contracts-build ## Declare class on mainnet: make declare SNCAST_ACCOUNT=name (see wallet-help)
	cd contracts && sncast --account $(SNCAST_ACCOUNT) declare --contract-name HimitsuVault --url $(STARKNET_RPC_URL)

deploy: ## Deploy vault: make deploy SNCAST_ACCOUNT=name CLASS_HASH=0x… OPERATOR=0x…
	sncast --account $(SNCAST_ACCOUNT) deploy --class-hash $(CLASS_HASH) \
	  --constructor-calldata $(POOL) $(OPERATOR) --url $(STARKNET_RPC_URL)
	@echo ">> Write the address into deployments/mainnet.json {\"vault\": \"0x…\"} and strk20.json contracts[]"

fund: ## Fund a reward pot: make fund SNCAST_ACCOUNT=name TOKEN=0x… AMOUNT=… (approve+fund via sncast invoke)
	sncast --account $(SNCAST_ACCOUNT) invoke -d $(TOKEN) -f approve -c $(VAULT) $(AMOUNT) 0 --url $(STARKNET_RPC_URL)
	sncast --account $(SNCAST_ACCOUNT) invoke -d $(VAULT) -f fund -c $(TOKEN) $(AMOUNT) --url $(STARKNET_RPC_URL)

epoch-close: ## Compute allocations + merkle for an epoch: make epoch-close EPOCH=1 TOKEN=0x… POT=… [FROM_BLOCK=…] [TO_BLOCK=…]
	cd indexer && pnpm tsx src/epoch-close.ts --epoch $(EPOCH) --pool $(POOL) --vault $(VAULT) \
	  --token $(TOKEN) --pot $(POT) \
	  $(if $(FROM_BLOCK),--from-block $(FROM_BLOCK)) $(if $(TO_BLOCK),--to-block $(TO_BLOCK))

post-root: ## Post an epoch root on-chain: make post-root SNCAST_ACCOUNT=name EPOCH=1 ROOT=0x… VEST_START=… VEST_DUR=…
	sncast --account $(SNCAST_ACCOUNT) invoke -d $(VAULT) -f post_root -c $(EPOCH) $(ROOT) $(VEST_START) $(VEST_DUR) \
	  --url $(STARKNET_RPC_URL)

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

wallet-help: ## Print account bootstrap commands (starkli for the account itself, sncast for declare/deploy/fund/post-root)
	@echo "starkli signer keystore from-key ~/.starkli/himitsu_key.json   # paste deployer private key"
	@echo "starkli account fetch <DEPLOYER_ADDRESS> --rpc \$$STARKNET_RPC_URL --output ~/.starkli/himitsu_acct.json"
	@echo "export STARKLI_KEYSTORE=~/.starkli/himitsu_key.json STARKLI_ACCOUNT=~/.starkli/himitsu_acct.json  # put in .env"
	@echo ""
	@echo ">> declare/deploy/fund/post-root need the SAME account imported into sncast too:"
	@echo "starkli signer keystore inspect-private ~/.starkli/himitsu_key.json --raw   # copy the key"
	@echo "sncast account import --name himitsu_mainnet --address <DEPLOYER_ADDRESS> --type oz \\"
	@echo "  --class-hash <ACCOUNT_CLASS_HASH from himitsu_acct.json> --private-key <paste> --url \$$STARKNET_RPC_URL"
	@echo "# then: make declare SNCAST_ACCOUNT=himitsu_mainnet"

clean: ## Remove build artifacts
	rm -rf contracts/target app/.next indexer/dist
