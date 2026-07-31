import { useEffect, useRef, useState } from "react";
import { Button } from "../../components/ui/button";
import { Label } from "../../components/ui/label";
import {
  type AssetSummary,
  documentIdFromFieldValue,
  getAsset,
  listAssets,
  uploadAsset,
} from "../content-entries";

export type MediaFieldLabels = {
  uploadFileLabel: string;
  uploadingLabel: string;
  pickExistingLabel: string;
  loadingAssetsLabel: string;
  clearLabel: string;
};

export function MediaFieldInput({
  label,
  required,
  value,
  onChange,
  labels,
}: Readonly<{
  label: string;
  required: boolean;
  value: string;
  onChange: (value: string) => void;
  labels: MediaFieldLabels;
}>) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<AssetSummary | null>(null);
  const [assets, setAssets] = useState<AssetSummary[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedDocumentId = documentIdFromFieldValue(value);

  useEffect(() => {
    let cancelled = false;
    if (!selectedDocumentId) {
      setPreview(null);
      return;
    }

    void getAsset(selectedDocumentId)
      .then((asset) => {
        if (!cancelled) setPreview(asset);
      })
      .catch(() => {
        if (!cancelled) setPreview(null);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedDocumentId]);

  async function onUpload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const asset = await uploadAsset(file);
      onChange(JSON.stringify({ documentId: asset.id }));
      setPreview(asset);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  }

  async function loadAssetLibrary() {
    setLoadingAssets(true);
    setError(null);
    try {
      setAssets(await listAssets());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingAssets(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Label>
        {label}
        {required ? " *" : ""}
      </Label>

      {preview?.url && (
        <img src={preview.url} alt="" className="h-10 w-10 rounded border object-contain p-1" />
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
        >
          {uploading ? labels.uploadingLabel : labels.uploadFileLabel}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={loadingAssets}
          onClick={() => void loadAssetLibrary()}
        >
          {loadingAssets ? labels.loadingAssetsLabel : labels.pickExistingLabel}
        </Button>
        {selectedDocumentId && (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange("")}>
            {labels.clearLabel}
          </Button>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void onUpload(file);
          e.target.value = "";
        }}
      />

      {assets.length > 0 && (
        <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto rounded-md border p-2">
          {assets.map((asset) => (
            <button
              key={asset.id}
              type="button"
              title={asset.fileName}
              onClick={() => onChange(JSON.stringify({ documentId: asset.id }))}
              className={
                selectedDocumentId === asset.id
                  ? "rounded border-2 border-primary p-1"
                  : "rounded border p-1 hover:bg-muted/60"
              }
            >
              {asset.url ? (
                <img src={asset.url} alt="" className="h-8 w-8 object-contain" />
              ) : (
                <span className="block px-2 text-xs">{asset.fileName}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
