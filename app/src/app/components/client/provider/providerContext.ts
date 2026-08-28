"use client";
import { create } from "zustand";

// 0 = SN_MAIN (the STRK20 pool + HimitsuVault live here), 2 = SN_SEPOLIA (light-pass testing).
interface FrontEndProviderState {
    currentFrontendProviderIndex: number,
    setCurrentFrontendProviderIndex: (currentFrontendProviderIndex: number) => void,
}

export const useFrontendProvider = create<FrontEndProviderState>()(set => ({
    currentFrontendProviderIndex: 0,
    setCurrentFrontendProviderIndex: (currentFrontendProviderIndex: number) => { set(state => ({ currentFrontendProviderIndex })) }
}));
