export const STANDARD_SECURITY_DISCLOSURE =
  "This personal app uses a GitHub token in your browser to access its configured data repository. A security flaw in this app, a dependency, a browser extension, or another app on the same origin may expose the token and locally cached private data. Use a fine-grained, expiring token limited to the displayed repository and minimum permissions. Session-only storage is recommended.";

export const SECURITY_DISCLOSURE = STANDARD_SECURITY_DISCLOSURE;

export function createSecurityDisclosureElement(document: Document): HTMLElement {
  const aside = document.createElement("aside");
  aside.dataset.repoAppSecurityDisclosure = "";
  aside.setAttribute("role", "note");
  const title = document.createElement("strong");
  title.textContent = "Credential security";
  const paragraph = document.createElement("p");
  paragraph.textContent = STANDARD_SECURITY_DISCLOSURE;
  aside.append(title, paragraph);
  return aside;
}
