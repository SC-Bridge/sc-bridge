/**
 * Cloudflare Images upload helper.
 *
 * Uploads a source URL to CF Images (CF fetches it server-side — no proxy needed).
 * Returns the cf_images_id assigned by CF, which is used to construct delivery URLs:
 *   https://imagedelivery.net/{CF_ACCOUNT_HASH}/{cf_images_id}/{variant}
 */

export async function uploadToCFImages(
  accountId: string,
  token: string,
  sourceURL: string,
  metadata: Record<string, string>,
): Promise<string> {
  const form = new FormData();
  form.append("url", sourceURL);
  form.append("metadata", JSON.stringify(metadata));
  form.append("requireSignedURLs", "false");

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/images/v1`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: form,
    },
  );

  const body = await response.json() as {
    success: boolean;
    result?: { id: string };
    errors?: { code: number; message: string }[];
  };

  if (!response.ok || !body.success) {
    const errMsg = body.errors?.map((e) => `${e.code}: ${e.message}`).join(", ") ?? `HTTP ${response.status}`;
    throw new Error(`CF Images upload failed: ${errMsg}`);
  }

  const id = body.result?.id;
  if (!id) {
    throw new Error("CF Images upload succeeded but returned no result.id");
  }

  return id;
}
