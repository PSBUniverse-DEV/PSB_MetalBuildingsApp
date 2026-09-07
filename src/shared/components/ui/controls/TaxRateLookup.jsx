"use client";

import { useState } from "react";
import { Alert, Spinner } from "react-bootstrap";
import Button from "@/shared/components/ui/controls/Button";
import Input from "@/shared/components/ui/controls/Input";
import Card from "@/shared/components/ui/surface/Card";
import useTaxRate from "@/shared/hooks/useTaxRate";
import styles from "./TaxRateLookup.module.css";

export default function TaxRateLookup() {
  const [zip, setZip] = useState("");
  const { data, loading, error, getTaxRate } = useTaxRate();

  function handleZipChange(e) {
    // Only allow numeric characters, max 5 digits.
    const raw = e.target.value.replace(/\D/g, "").slice(0, 5);
    setZip(raw);
  }

  async function handleLookup() {
    await getTaxRate(zip);
  }

  const isComplete = zip.length === 5;

  return (
    <Card
      title="Sales Tax Rate Lookup"
      subtitle="Enter a US ZIP code to look up the combined sales tax rate."
      className={styles.card}
    >
      <div className={styles.inputRow}>
        <Input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={5}
          placeholder="e.g. 10001"
          value={zip}
          onChange={handleZipChange}
          aria-label="ZIP code"
          className={styles.zipInput}
        />

        <Button
          variant="primary"
          disabled={!isComplete}
          loading={loading}
          onClick={handleLookup}
        >
          Get Tax Rate
        </Button>
      </div>

      {/* ── Loading indicator (shown inside button via `loading` prop) ─────── */}
      {loading && (
        <div className={styles.loadingHint}>
          <Spinner size="sm" animation="border" role="status" className="me-2" />
          Looking up tax rate…
        </div>
      )}

      {/* ── Error ──────────────────────────────────────────────────────────── */}
      {error && (
        <Alert variant="danger" className={styles.alert}>
          {error}
        </Alert>
      )}

      {/* ── Success result ─────────────────────────────────────────────────── */}
      {data && !loading && !error && (
        <div className={styles.result}>
          <div className={styles.resultRow}>
            <span className={styles.resultLabel}>City</span>
            <span className={styles.resultValue}>{data.city}</span>
          </div>
          <div className={styles.resultRow}>
            <span className={styles.resultLabel}>State</span>
            <span className={styles.resultValue}>{data.state}</span>
          </div>
          <div className={styles.resultRow}>
            <span className={styles.resultLabel}>Combined Rate</span>
            <span className={styles.resultValue}>
              {data.rates?.combined_pct ?? "—"}
            </span>
          </div>
        </div>
      )}
    </Card>
  );
}