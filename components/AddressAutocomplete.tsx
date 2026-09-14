"use client";

import { useEffect, useRef, useState } from "react";

// Google Places Autocomplete on the property-address field — as soon as
// the customer starts typing, Google's own dropdown of matching addresses
// appears. Fails open: without a configured GOOGLE_MAPS_API_KEY, this is
// just a plain text input, same as before this existed.

type GoogleMapsWindow = Window & {
  google?: {
    maps: {
      places: {
        Autocomplete: new (
          input: HTMLInputElement,
          opts?: Record<string, unknown>
        ) => {
          addListener: (event: string, handler: () => void) => void;
          getPlace: () => { formatted_address?: string };
        };
      };
    };
  };
};

let mapsScriptPromise: Promise<void> | null = null;

function loadGoogleMapsScript(apiKey: string): Promise<void> {
  const w = window as GoogleMapsWindow;
  if (w.google?.maps?.places) return Promise.resolve();
  if (mapsScriptPromise) return mapsScriptPromise;

  mapsScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
      apiKey
    )}&libraries=places&loading=async`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google Maps script"));
    document.head.appendChild(script);
  });

  return mapsScriptPromise;
}

type AddressAutocompleteProps = {
  value: string;
  onChange: (value: string) => void;
};

export default function AddressAutocomplete({
  value,
  onChange,
}: AddressAutocompleteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [autocompleteReady, setAutocompleteReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/config/maps-key")
      .then((res) => res.json() as Promise<{ apiKey: string | null }>)
      .then(({ apiKey }) => {
        if (cancelled || !apiKey || !inputRef.current) return;
        return loadGoogleMapsScript(apiKey).then(() => {
          if (cancelled || !inputRef.current) return;
          const w = window as GoogleMapsWindow;
          if (!w.google?.maps?.places) return;

          const autocomplete = new w.google.maps.places.Autocomplete(
            inputRef.current,
            {
              types: ["address"],
              componentRestrictions: { country: "us" },
              fields: ["formatted_address"],
            }
          );
          autocomplete.addListener("place_changed", () => {
            const place = autocomplete.getPlace();
            if (place.formatted_address) onChange(place.formatted_address);
          });
          setAutocompleteReady(true);
        });
      })
      .catch(() => {
        // Fails open — plain text input below still works fine.
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <input
      ref={inputRef}
      type="text"
      className="cfg-sub-select"
      style={{ marginBottom: "12px" }}
      placeholder={
        autocompleteReady
          ? "Start typing your address…"
          : "Property address"
      }
      value={value}
      onChange={(e) => onChange(e.target.value)}
      autoComplete="off"
    />
  );
}
