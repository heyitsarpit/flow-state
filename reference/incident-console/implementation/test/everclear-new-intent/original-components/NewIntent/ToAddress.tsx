import type { Variants } from "framer-motion";
import { AnimatePresence, LazyMotion, domAnimation, m } from "framer-motion";
import { MotionGlobalConfig } from "framer-motion";
import { useEffect } from "react";
import { PiSealWarningDuotone } from "react-icons/pi";
import { useShallow } from "zustand/react/shallow";

import { Box } from "@repo/design/Box";
import { Text, textStyles } from "@repo/design/Text";
import * as Tooltip from "@repo/design/Tooltip";

import { cn } from "@repo/design/utils";
import type { Network } from "@repo/lib/Chains";
import { useDebounceSync } from "./useDebounceSync";
import { useInputState } from "./useInputState";

MotionGlobalConfig.skipAnimations = true;

type ToAddressProps = {
  network: Network;
};
export function ToAddress({ network }: ToAddressProps) {
  const [toAddress, useToAddress] = useInputState(useShallow((s) => [s.toAddress, s.useToAddress]));

  useEffect(() => {
    // avoid initial animations when toAddress is set in URL
    setTimeout(() => {
      MotionGlobalConfig.skipAnimations = false;
    }, 1000);
  }, []);

  const syncToURL = useDebounceSync(500);

  function updateToAddress(address: string) {
    useInputState.setState({ toAddress: address });
    syncToURL();
  }

  useEffect(() => {
    useInputState.getState().validateAddress(toAddress);
  }, [toAddress]);

  return (
    <LazyMotion features={domAnimation}>
      <AnimatePresence initial={false}>
        {useToAddress ? (
          <m.div
            transition={{ duration: 0.2, ease: "easeOut" }}
            variants={variants}
            initial="initial"
            animate="animate"
            key="to-address"
            exit="exit"
          >
            <Box className="space-y-2 rounded-xl border-none" intent={"highlight"}>
              <div className="flex justify-between">
                <Text variant={"body-2"}>Receiving Address [required]</Text>

                <WarningTooltip />
              </div>

              <input
                className={cn(
                  `bg-theme-button-secondary w-full p-0 outline-none ${textStyles({ variant: "body-1" })}`,
                )}
                onChange={(e) => updateToAddress(e.target.value)}
                placeholder={`Enter ${NetworkLabels[network]} recipient address`}
                value={toAddress || ""}
              />
            </Box>
          </m.div>
        ) : null}
      </AnimatePresence>
    </LazyMotion>
  );
}

function WarningTooltip() {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger className="text-theme-text-muted">
        <PiSealWarningDuotone fill={"currentColor"} className="h-4 w-4" />
      </Tooltip.Trigger>
      <Tooltip.Content className="w-fit p-4">
        <Text className="text-theme-text-muted" variant={"body-3"}>
          Please make sure the receiving address is correct, owned by <br /> and accessible to you
          on <span className="font-bold">all</span> of the selected destination chains.
        </Text>
      </Tooltip.Content>
    </Tooltip.Root>
  );
}

const variants: Variants = {
  animate: { opacity: 1, height: "auto", marginTop: 8, scale: 1 },
  initial: { opacity: 0, height: 0, marginTop: 0, scale: 0.9 },
  exit: { opacity: 0, height: 0, marginTop: 0, scale: 0.9 },
};

const NetworkLabels: Record<Network, string> = {
  evm: "Ethereum",
  svm: "Solana",
  tvm: "Tron",
};
