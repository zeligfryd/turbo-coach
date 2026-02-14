"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { BleDevice } from "@/lib/ble/types";

type DeviceScannerProps = {
  disabled?: boolean;
  requestDevice: () => Promise<BleDevice>;
  onDeviceSelected: (device: BleDevice) => Promise<void>;
};

export function DeviceScanner({
  disabled,
  requestDevice,
  onDeviceSelected,
}: DeviceScannerProps) {
  const [open, setOpen] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleScan(): Promise<void> {
    setIsScanning(true);
    setError(null);
    try {
      // Use the adapter-backed request path so the selected device
      // is cached and can be connected by id afterwards.
      const selected = await requestDevice();
      await onDeviceSelected(selected);
      setOpen(false);
    } catch (scanError) {
      const message =
        scanError instanceof Error ? scanError.message : "Failed to scan for FTMS trainers.";
      setError(message);
    } finally {
      setIsScanning(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" disabled={disabled}>
          Connect Trainer
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Scan for FTMS Trainers</DialogTitle>
          <DialogDescription>
            The browser will open a Bluetooth picker filtered to Fitness Machine Service devices.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Button type="button" onClick={handleScan} disabled={isScanning} className="w-full">
            {isScanning ? "Scanning..." : "Scan and Select Device"}
          </Button>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <p className="text-xs text-muted-foreground">
            Web Bluetooth requires an explicit user gesture to scan.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
