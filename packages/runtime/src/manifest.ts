export type AuthMethod = "pat";
export type CredentialPersistence = "memory" | "session" | "optional-persistent";

export interface SelfRepositoryManifest {
  readonly mode: "self";
  readonly branch: string;
  readonly dataRoot: string;
}

export interface FixedRepositoryManifest {
  readonly mode: "fixed";
  readonly owner: string;
  readonly name: string;
  readonly branch: string;
  readonly dataRoot: string;
}

export type RepositoryManifest = SelfRepositoryManifest | FixedRepositoryManifest;

export interface DataPipelineManifest {
  readonly mode: "actions";
  /** Workflow file name in the fixed data repository, for example validate-data.yml. */
  readonly workflow: string;
  /** Replaceable private artifacts written only by the data workflow. */
  readonly derivedRoot: string;
}

export interface RepoAppManifest {
  readonly id: string;
  readonly title: string;
  readonly repository: RepositoryManifest;
  readonly dataPipeline?: DataPipelineManifest;
  readonly auth: {
    readonly methods: readonly AuthMethod[];
    readonly persistence: CredentialPersistence;
    readonly sharedCredential: boolean;
  };
  readonly demo: { readonly fixture: string };
  readonly writes: {
    readonly defaultStrategy: "direct";
    readonly conflictStrategy: "prompt";
  };
}

export interface RuntimeBuildMetadata {
  readonly githubRepository: string;
  readonly appVersion?: string;
  readonly branch?: string;
  readonly commitSha?: string;
}

export interface RepoAppRuntimeConfig {
  readonly appId: string;
  readonly title: string;
  readonly repository: {
    readonly mode: RepositoryManifest["mode"];
    readonly owner: string;
    readonly name: string;
    readonly branch: string;
    readonly dataRoot: string;
  };
  readonly deploymentRepository: {
    readonly owner: string;
    readonly name: string;
  };
  readonly dataPipeline?: DataPipelineManifest;
  readonly appVersion: string;
  readonly commitSha?: string;
}

export function defineRepoApp<const T extends RepoAppManifest>(manifest: T): T {
  validateManifest(manifest);
  return Object.freeze(manifest);
}

/** Resolve trusted Actions build metadata into public, token-free runtime config. */
export function resolveRuntimeConfig(
  manifest: RepoAppManifest,
  metadata: RuntimeBuildMetadata,
): RepoAppRuntimeConfig {
  validateManifest(manifest);
  const parts = metadata.githubRepository.split("/");
  const deploymentOwner = parts[0]?.trim();
  const deploymentName = parts[1]?.trim();
  if (parts.length !== 2 || !validRepositoryPart(deploymentOwner) || !validRepositoryPart(deploymentName)) {
    throw new Error("githubRepository must use the trusted 'owner/repository' form.");
  }
  const repository = manifest.repository.mode === "self"
    ? {
        mode: "self" as const,
        owner: deploymentOwner,
        name: deploymentName,
        branch: metadata.branch?.trim() || manifest.repository.branch,
        dataRoot: manifest.repository.dataRoot,
      }
    : {
        mode: "fixed" as const,
        owner: manifest.repository.owner.trim(),
        name: manifest.repository.name.trim(),
        branch: manifest.repository.branch,
        dataRoot: manifest.repository.dataRoot,
      };
  return Object.freeze({
    appId: manifest.id,
    title: manifest.title,
    repository: Object.freeze(repository),
    deploymentRepository: Object.freeze({ owner: deploymentOwner, name: deploymentName }),
    ...(manifest.dataPipeline === undefined ? {} : { dataPipeline: Object.freeze({ ...manifest.dataPipeline }) }),
    appVersion: metadata.appVersion?.trim() || metadata.commitSha?.slice(0, 12) || "development",
    ...(metadata.commitSha === undefined ? {} : { commitSha: metadata.commitSha }),
  });
}

function validateManifest(manifest: RepoAppManifest): void {
  if (!manifest.id.trim() || !/^[a-z0-9][a-z0-9-]*$/.test(manifest.id)) {
    throw new Error("Repo app id must be a non-empty lowercase slug.");
  }
  if (!manifest.title.trim()) throw new Error("Repo app title is required.");
  if (manifest.repository.mode !== "self" && manifest.repository.mode !== "fixed") {
    throw new Error("Repository mode must be self or fixed.");
  }
  if (!manifest.repository.branch.trim() || !safeRelativePath(manifest.repository.dataRoot)) {
    throw new Error("Repository branch and a safe relative dataRoot are required.");
  }
  if (manifest.repository.mode === "fixed" &&
    (!validRepositoryPart(manifest.repository.owner.trim()) || !validRepositoryPart(manifest.repository.name.trim()))) {
    throw new Error("A fixed repository requires a safe owner and name.");
  }
  if (!manifest.auth.methods.length) throw new Error("At least one authentication method is required.");
  if (manifest.auth.methods.some((method) => method !== "pat")) {
    throw new Error("Static repo apps support fine-grained PAT authentication only.");
  }
  if (!["memory", "session", "optional-persistent"].includes(manifest.auth.persistence)) {
    throw new Error("Credential persistence must be memory, session, or optional-persistent.");
  }
  if (manifest.auth.sharedCredential && manifest.auth.persistence !== "optional-persistent") {
    throw new Error("Shared credentials require explicit optional-persistent storage.");
  }
  if (manifest.dataPipeline !== undefined) {
    if (manifest.repository.mode !== "fixed") {
      throw new Error("A separate data pipeline is supported only for a fixed data repository.");
    }
    if (manifest.dataPipeline.mode !== "actions" || !safeWorkflowName(manifest.dataPipeline.workflow) ||
      !safeRelativePath(manifest.dataPipeline.derivedRoot)) {
      throw new Error("The data pipeline requires an Actions workflow file and safe derivedRoot.");
    }
    if (pathsOverlap(manifest.repository.dataRoot, manifest.dataPipeline.derivedRoot)) {
      throw new Error("Canonical dataRoot and generated derivedRoot must not overlap.");
    }
  }
  if (!safeRelativePath(manifest.demo.fixture.replace(/^\.\//, ""))) throw new Error("Demo fixture must be relative.");
  if (manifest.writes.defaultStrategy !== "direct" || manifest.writes.conflictStrategy !== "prompt") {
    throw new Error("The MVP requires direct writes and prompt conflict handling.");
  }
}

function validRepositoryPart(value: string | undefined): value is string {
  return Boolean(value) && !value!.includes("/") && value !== "." && value !== "..";
}

function safeWorkflowName(value: string): boolean {
  return /^[A-Za-z0-9._-]+\.ya?ml$/.test(value.trim());
}

function pathsOverlap(left: string, right: string): boolean {
  const a = left.replace(/\/$/, "");
  const b = right.replace(/\/$/, "");
  return a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
}

function safeRelativePath(value: string): boolean {
  return Boolean(value) && !value.startsWith("/") && !value.split("/").some((part) => part === ".." || part === "");
}
