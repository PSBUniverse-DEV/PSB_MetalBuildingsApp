"use client";

import { useCallback, useState } from "react";

// ──────────────────────────────────────────────────────────────────────────────
// SalesTaxZip is a free, no-auth API — 100 requests / hour suitable for
// prototyping and demos.  Production apps requiring tax-compliance accuracy
// should validate rates against a paid provider (e.g. TaxJar, Avalara) before
// going live.
// ──────────────────────────────────────────────────────────────────────────────

const API_BASE = "https://salestaxzip.com/api/v1/rate";
const ZIP_REGEX = /^\d{5}$/;

/**
 * Custom hook for looking up US sales-tax rates by 5-digit ZIP code via the
 * free SalesTaxZip API.
 *
 * @returns {{ data: object|null, loading: boolean, error: string|null, getTaxRate: (zip: string) => Promise<void> }}
 */
export default function useTaxRate() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  /**
   * Fetch the tax rate for the provided ZIP code.
   * @param {string} zip — a 5-digit US ZIP code
   */
  const getTaxRate = useCallback(async (zip) => {
    // ── validate input ────────────────────────────────────────────────────
    const trimmed = String(zip ?? "").trim();
    if (!ZIP_REGEX.test(trimmed)) {
      setData(null);
      setError("Please enter a valid 5-digit US ZIP code.");
      return;
    }

    setData(null);
    setError(null);
    setLoading(true);

    try {
      const response = await fetch(`${API_BASE}/${trimmed}`);

      if (!response.ok) {
        throw new Error(
          `Service returned HTTP ${response.status} — please try again later.`
        );
      }

      const body = await response.json();

      // The API can return success:false for invalid / unsupported ZIPs.
      if (!body.success) {
        throw new Error(
          body.message ||
            "Unable to retrieve tax data for this ZIP code. Please verify and try again."
        );
      }

      setData(body.data ?? body);
    } catch (err) {
      // Network failure, CORS issue, or thrown error above.
      const message =
        err instanceof Error
          ? err.message
          : "An unexpected error occurred while fetching tax data.";
      setData(null);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  return { data, loading, error, getTaxRate };
}