"use client";
import { useEffect, useState } from "react";
import { walletV6, validateAndParseAddress, constants as SNconstants, WalletAccountV6 } from "starknet";
import { WALLET_API } from "@starknet-io/types-js";
import { myFrontendProviders } from "@/utils/constants";
import { createStore, type Store } from "@starknet-io/get-starknet-discovery";
import type {
  WalletWithStarknetFeatures,
} from '@starknet-io/get-starknet-wallet-standard/features';
import { Loader2Icon, ArrowRightIcon, LogOutIcon, ChevronDownIcon, CopyIcon, ExternalLinkIcon, WalletIcon } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogPopup, DialogHeader, DialogTitle, DialogPanel } from "@/components/ui/dialog";
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { useStoreWallet } from "../../Wallet/walletContext";
import { useFrontendProvider } from "../provider/providerContext";
import { voyagerAddress } from "@/utils/constants";


// Normalize wallet identifiers so starknetkit's connector id / SWO name
// ("argentX", "Ready", "Braavos") can be matched against the wallet-standard
// wallet's display name ("Argent X", "Braavos", ...).
function normalizeId(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export default function SelectWallet({ variant = "ctaBig" }: { variant?: "nav" | "ctaBig" }) {

  const setMyWallet = useStoreWallet(state => state.setMyStarknetWalletObject);

  const setMyWalletAccount = useStoreWallet(state => state.setMyWalletAccount);
  const myFrontendProviderIndex = useFrontendProvider(state => state.currentFrontendProviderIndex);
  const { setCurrentFrontendProviderIndex } = useFrontendProvider(state => state);

  const isConnected = useStoreWallet(state => state.isConnected);
  const setConnected = useStoreWallet(state => state.setConnected);
  const address = useStoreWallet(state => state.address);

  const setWalletApi = useStoreWallet(state => state.setWalletApiList);

  const setChain = useStoreWallet(state => state.setChain);
  const setAddressAccount = useStoreWallet(state => state.setAddressAccount);

  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string>("");
  const [pickerOpen, setPickerOpen] = useState(false);
  // Detected Starknet wallets, in render state so the picker updates as wallets register.
  const [wallets, setWallets] = useState<WalletWithStarknetFeatures[]>([]);

  // Create the discovery store once on mount so wallets have time to register
  // before the user opens the picker. eip1193Adapters:[] keeps MetaMask out entirely
  // (no EIP-6963 MetaMask bridging / Snap probing).
  useEffect(() => {
    const store: Store = createStore({ eip1193Adapters: [] });
    setWallets(store.getWallets().slice());
    const unsub = store.subscribe((next) => setWallets(next.slice()));
    return () => unsub();
  }, []);

  // Show every detected wallet except MetaMask (its Snap probing spams an unlock popup).
  const pickable = wallets.filter((w) => {
    const id = normalizeId(w.name);
    return !id.includes("metamask");
  });

  // Unchanged connection flow: takes the wallet-standard wallet and populates
  // the zustand store with a WalletAccountV6 + account/chain/permissions.
  async function handleSelectedWallet(selectedWallet: WalletWithStarknetFeatures) {
    setMyWallet(selectedWallet); // zustand
    console.log("Trying to connect wallet=", selectedWallet);
    const myWA = await WalletAccountV6.connect(myFrontendProviders[2], selectedWallet);
    setMyWalletAccount(myWA);
    console.log("WalletAccount created=", myWA);
    const result = await walletV6.requestAccounts(selectedWallet);
    if (typeof (result) == "string") {
      console.log("This Wallet is not compatible.");
      return;
    }
    console.log("Current account addr =", result);
    if (Array.isArray(result)) {
      const addr = validateAndParseAddress(result[0]);
      setAddressAccount(addr); // zustand
    }
    const isConnectedWallet: boolean = await walletV6.getPermissions(selectedWallet).then((res: any) => (res as WALLET_API.Permission[]).includes(WALLET_API.Permission.ACCOUNTS));
    setConnected(isConnectedWallet); // zustand
    if (isConnectedWallet) {
      const chainId = (await walletV6.requestChainId(selectedWallet)) as string;
      setChain(chainId);
      setCurrentFrontendProviderIndex(chainId === SNconstants.StarknetChainId.SN_MAIN ? 0 : 2);
      console.log("change Provider index to :", myFrontendProviderIndex);
    }
    setWalletApi(await walletV6.supportedSpecs(selectedWallet));
  }

  // Open the wallet picker so the user can choose (Ready, Xverse, ...).
  const openPicker = () => {
    setError("");
    setPickerOpen(true);
  };

  // Connect the wallet the user picked from the modal.
  //
  // We deliberately do NOT use starknetkit's connect() here: it bundles
  // get-starknet-core, whose MetaMask detection (waitForMetaMaskProvider, retries:3)
  // repeatedly dispatches EIP-6963 discovery and probes MetaMask's Starknet Snap,
  // spamming its unlock popup. eip1193Adapters:[] above keeps MetaMask out of discovery
  // entirely, and only the picked wallet ever receives a request().
  async function selectWallet(w: WalletWithStarknetFeatures) {
    setError("");
    setConnecting(true);
    try {
      await handleSelectedWallet(w);
      setPickerOpen(false);
    } catch (err: any) {
      console.log("Wallet connection failed.\n", err);
      setError(err?.message ?? "Wallet connection failed.");
    } finally {
      setConnecting(false);
    }
  }

  const shortAddr = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "";

  async function copyAddress() {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
    } catch {
      // clipboard API unavailable — the address is still visible/selectable in the menu trigger
    }
  }

  // Base UI's Dialog handles the portal, focus trap, scroll lock and Escape-to-close for
  // free — onOpenChange only lets it close when a connection isn't in flight, same guard
  // the old hand-rolled backdrop click had.
  const picker = (
    <Dialog open={pickerOpen} onOpenChange={(open) => !connecting && setPickerOpen(open)}>
      <DialogPopup>
        <DialogHeader>
          <DialogTitle>Connect a wallet</DialogTitle>
        </DialogHeader>
        <DialogPanel className="pt-0">
          {pickable.length ? (
            <div className="flex flex-col gap-2">
              {pickable.map((w) => (
                <button
                  key={w.name}
                  onClick={() => selectWallet(w)}
                  disabled={connecting}
                  className="flex items-center gap-3 rounded-lg border border-input bg-popover px-3 py-3 text-left transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-64"
                >
                  <Avatar className="size-6 rounded-md">
                    <AvatarImage src={w.icon} alt="" />
                    <AvatarFallback className="rounded-md">
                      <WalletIcon className="size-3.5" />
                    </AvatarFallback>
                  </Avatar>
                  <span className="flex-1 font-medium text-foreground">{w.name}</span>
                  {connecting ? (
                    <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
                  ) : (
                    <ArrowRightIcon className="size-4 text-muted-foreground" />
                  )}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No Starknet wallet detected. Install{" "}
              <a className="text-primary underline underline-offset-2" href="https://www.ready.co/" target="_blank" rel="noreferrer">Ready</a> or{" "}
              <a className="text-primary underline underline-offset-2" href="https://www.xverse.app/" target="_blank" rel="noreferrer">Xverse</a>.
            </p>
          )}

          {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
        </DialogPanel>
      </DialogPopup>
    </Dialog>
  );

  // Nav variant: a compact Connect pill, or the connected address with disconnect.
  if (variant === "nav") {
    if (isConnected && address) {
      return (
        <Menu>
          <MenuTrigger
            render={
              <Button variant="outline" size="sm" className="rounded-full font-mono tabular-nums shadow-none">
                <span className="size-1.5 rounded-full bg-success" aria-hidden="true" />
                {shortAddr}
                <ChevronDownIcon className="size-3.5 text-muted-foreground" />
              </Button>
            }
          />
          <MenuPopup align="end">
            <MenuItem onClick={copyAddress}>
              <CopyIcon />
              Copy address
            </MenuItem>
            <MenuItem
              render={
                <a href={voyagerAddress(myFrontendProviderIndex, address)} target="_blank" rel="noreferrer" />
              }
            >
              <ExternalLinkIcon />
              View on Voyager
            </MenuItem>
            <MenuSeparator />
            <MenuItem variant="destructive" onClick={() => setConnected(false)}>
              <LogOutIcon />
              Disconnect
            </MenuItem>
          </MenuPopup>
        </Menu>
      );
    }
    return (
      <>
        <Button size="sm" onClick={openPicker} className="rounded-full shadow-none">
          Connect wallet
        </Button>
        {picker}
      </>
    );
  }

  // Default (ctaBig): the large solid connect CTA shown in the panel until a
  // wallet is connected.
  return (
    <>
      <Button size="lg" onClick={openPicker}>
        Connect a Wallet
      </Button>
      {picker}
    </>
  );
}
