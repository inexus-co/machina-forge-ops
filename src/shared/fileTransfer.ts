/**
 * How a file gets between this machine and the server.
 *
 * Over SSH there is SFTP and there is nothing to decide. Over a shell handed back by a provider's
 * tool there is no SFTP, and a file has to travel as base64 down the same stream it types into —
 * which is fine for a configuration file and hopeless for a database dump.
 *
 * So, for the big ones, a place both ends can reach: the operator's own bucket. Which bucket, and
 * whose, is theirs to say — S3 is the obvious one on AWS and it is not the only one, and a store
 * nobody here has heard of is the last row rather than a dead end.
 *
 * **The table is the whole of it**, the same as `wayIn.ts`: a way of transferring a file is a row with a
 * place to ask for and two commands, and adding one is adding a row. The two commands are
 * symmetrical on purpose — *put this file there under this name*, and *get that name back into
 * this file* — because both machines run both, and the machine that runs them is the only
 * difference between sending and fetching.
 *
 * **Nothing of the store's is kept here.** Both sides use the credentials they already have: ours
 * from the operator's own profile, the server's from whatever its instance was given. This holds
 * a location, not a key.
 */

/** One thing a way of transferring files needs asked for. */
export type FileTransferFieldSpec = {
  key: string;
  /** The operator's word for it. Translated where it is drawn. */
  label: string;
  placeholder: string;
  optional?: boolean;
};

/** Where a file is, and what it is called in the store. */
export type FileTransferSpot = {
  /** The path on whichever machine is running the command. */
  file: string;
  /** The name in the store — ours to choose, and thrown away afterwards. */
  name: string;
};

export type FileTransferWay = {
  id: string;
  name: string;
  /** Set where the name is ours rather than a product's, and so has to be translated. */
  ourWords?: boolean;
  fields: FileTransferFieldSpec[];
  /** What this way costs or needs. Translated where it is drawn. */
  note: string;
  /**
   * Putting a file into the store, and taking one back out.
   *
   * Absent on the first row, which is the one that needs no store at all. Both are run on either
   * machine: this side sends by putting and the server fetches by getting, and the other direction
   * is the same two commands the other way round.
   */
  put?: (values: Record<string, string>, spot: FileTransferSpot) => string;
  get?: (values: Record<string, string>, spot: FileTransferSpot) => string;
  /** Removing what was left behind. A courier that keeps copies is a leak with a bucket bill. */
  clear?: (values: Record<string, string>, spot: { name: string }) => string;
};

/** The place, without a trailing slash, so joining a name to it never doubles one. */
const place = (values: Record<string, string>) => (values.place ?? "").trim().replace(/\/+$/, "");

/** Whatever the operator wrote, with the two things only this side knows filled in. */
const filled = (template: string, spot: FileTransferSpot) =>
  template.replaceAll("%f", spot.file).replaceAll("%n", spot.name);

export const FILE_TRANSFER_WAYS: FileTransferWay[] = [
  {
    id: "direct",
    name: "Straight down the connection",
    ourWords: true,
    fields: [],
    note: "Over SSH that is SFTP. Over a shell handed back by a provider's command there is no SFTP, so the file travels as text down the same stream — which suits a configuration file and not a database dump.",
  },
  {
    id: "s3",
    name: "Amazon S3",
    fields: [{ key: "place", label: "Where to leave it", placeholder: "s3://my-bucket/forge-ops" }],
    note: "Both machines need the AWS CLI and permission for that prefix — the server's from the role its instance already has, yours from the profile you already use.",
    put: (values, spot) => `aws s3 cp ${spot.file} ${place(values)}/${spot.name}`,
    get: (values, spot) => `aws s3 cp ${place(values)}/${spot.name} ${spot.file}`,
    clear: (values, spot) => `aws s3 rm ${place(values)}/${spot.name}`,
  },
  {
    id: "gcs",
    name: "Google Cloud Storage",
    fields: [{ key: "place", label: "Where to leave it", placeholder: "gs://my-bucket/forge-ops" }],
    note: "Both machines need the Google Cloud CLI and permission for that prefix.",
    put: (values, spot) => `gcloud storage cp ${spot.file} ${place(values)}/${spot.name}`,
    get: (values, spot) => `gcloud storage cp ${place(values)}/${spot.name} ${spot.file}`,
    clear: (values, spot) => `gcloud storage rm ${place(values)}/${spot.name}`,
  },
  {
    id: "azure",
    name: "Azure Blob Storage",
    fields: [
      { key: "place", label: "Where to leave it", placeholder: "my-container/forge-ops" },
      { key: "account", label: "Storage account", placeholder: "mystorageaccount" },
    ],
    note: "Both machines need the Azure CLI and permission on that container.",
    put: (values, spot) =>
      `az storage blob upload --account-name ${(values.account ?? "").trim()} --container-name ${place(values).split("/")[0]} --name ${namePath(values, spot.name)} --file ${spot.file} --overwrite`,
    get: (values, spot) =>
      `az storage blob download --account-name ${(values.account ?? "").trim()} --container-name ${place(values).split("/")[0]} --name ${namePath(values, spot.name)} --file ${spot.file}`,
    clear: (values, spot) =>
      `az storage blob delete --account-name ${(values.account ?? "").trim()} --container-name ${place(values).split("/")[0]} --name ${namePath(values, spot.name)}`,
  },
  {
    /*
     * The last row, and the reason a store nobody here has heard of is not a dead end.
     *
     * MinIO, Backblaze, a company's own file server, `scp` to a machine both can see: all of them
     * are "put this there" and "get that back", and the two things this side knows that the
     * operator does not are the path and the name.
     */
    id: "other",
    name: "Somewhere else",
    ourWords: true,
    fields: [
      { key: "put", label: "The command that puts a file there", placeholder: "mc cp %f myminio/forge-ops/%n" },
      { key: "get", label: "The command that gets it back", placeholder: "mc cp myminio/forge-ops/%n %f" },
    ],
    note: "Both run on whichever machine is sending or fetching, so both have to work on both. {f} is the file on that machine, {n} the name in the store.",
    put: (values, spot) => filled(values.put ?? "", spot),
    get: (values, spot) => filled(values.get ?? "", spot),
  },
];

/** The name inside the container, for stores that separate the container from the path. */
function namePath(values: Record<string, string>, name: string) {
  const [, ...rest] = place(values).split("/");
  return [...rest, name].join("/");
}

export function transferWayFor(id: string | undefined): FileTransferWay | undefined {
  return FILE_TRANSFER_WAYS.find((each) => each.id === id);
}

/** Which of a way's fields have not been filled in. The form asks; nothing else does. */
export function missingTransferFields(move: {
  via: string;
  values: Record<string, string>;
}): FileTransferFieldSpec[] {
  const way = transferWayFor(move.via);
  if (!way) return [];
  return way.fields.filter(
    (field) => !field.optional && !(move.values ?? {})[field.key]?.trim(),
  );
}
