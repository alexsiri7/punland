/**
 * The owner's Edit button, shown in the game only to the owner (editor spec). It stays disabled
 * until edit mode (#123) gives it something to do.
 */
export function createEditButton(doc: Document): HTMLButtonElement {
  const button = doc.createElement('button');
  button.type = 'button';
  button.className = 'edit-button';
  button.textContent = 'Edit';
  button.disabled = true;
  return button;
}
