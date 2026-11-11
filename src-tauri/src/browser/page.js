// Executed only in WebKit's isolated client world, never in the website's JS namespace.
(action) => {
  try {
    const padding = Math.max(0, Math.min(24576, action.redactionPadding || 0));
    let state = globalThis.__lotseBrowser;
    if (!state || state.url !== location.href) {
      state = { url: location.href, references: new Map() };
      globalThis.__lotseBrowser = state;
    }
    const roots = [];
    const frames = [];
    const visit = (root) => {
      roots.push(root);
      for (const node of root.querySelectorAll('*')) {
        if (node.shadowRoot) visit(node.shadowRoot);
        if (node.localName === 'iframe' || node.localName === 'frame') {
          try {
            if (node.contentDocument) visit(node.contentDocument);
            else frames.push({ url: node.src, supported: false });
          } catch { frames.push({ url: node.src, supported: false }); }
        }
      }
    };
    visit(document);
    const visible = (el) => {
      const rect = el.getBoundingClientRect();
      const style = el.ownerDocument.defaultView.getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    if (action.action === 'snapshot') {
      state.references.clear();
      const prefix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
      const elements = [];
      for (const root of roots) {
        for (const el of root.querySelectorAll('a[href],button,input,textarea,select,[role],[tabindex],[contenteditable="true"],summary')) {
          if (!visible(el) || elements.length >= 500) continue;
          const reference = `${prefix}:${elements.length}`;
          state.references.set(reference, el);
          const labels = el.labels ? Array.from(el.labels, (label) => { const copy = label.cloneNode(true); for (const control of copy.querySelectorAll('input,textarea,select,button')) control.remove(); return copy.textContent.trim(); }).join(' ') : '';
          elements.push({ reference, tag: el.localName, role: el.getAttribute('role'), name: (el.getAttribute('aria-label') || labels || el.innerText || el.getAttribute('placeholder') || '').trim().slice(0, 500 + padding), type: el.type, value: el.type === 'password' || globalThis.__lotseCredentialFields?.has(el) ? undefined : el.value?.slice(0, 1000 + padding), disabled: !!el.disabled, options: el.localName === 'select' ? Array.from(el.options, (o) => ({ value: o.value, label: o.text, disabled: o.disabled })).slice(0, 100) : undefined });
        }
      }
      return JSON.stringify({ url: location.href, title: document.title, text: roots.map((root) => (root.body || root).innerText || root.textContent || '').join('\n').slice(0, 40000 + padding), elements, frames, truncated: elements.length >= 500 });
    }
    if (action.action === 'scroll') {
      window.scrollBy(action.x, action.y);
      return JSON.stringify({ ok: true, x: scrollX, y: scrollY });
    }
    const el = state.references.get(action.reference);
    if (!el || !el.isConnected || !roots.some((root) => root === el.getRootNode())) throw new Error('Stale element reference. Read get_task_browser again.');
    if (!visible(el) || el.disabled || el.getAttribute('aria-disabled') === 'true') throw new Error('Element is hidden or disabled.');
    if (action.action === 'key' && ['Backspace', 'Delete'].includes(action.key)
      && (el.type === 'password' || globalThis.__lotseCredentialFields?.has(el))) throw new Error('Use secure autofill to replace saved login fields.');
    el.scrollIntoView({ block: 'center', inline: 'nearest' });
    el.focus();
    const view = el.ownerDocument.defaultView;
    const input = () => el.dispatchEvent(new view.Event('input', { bubbles: true, composed: true }));
    const change = () => el.dispatchEvent(new view.Event('change', { bubbles: true }));
    const fill = (text) => {
      if (el.readOnly) throw new Error('Field is read-only.');
      if (el.localName === 'textarea' || (el.localName === 'input' && !['file', 'checkbox', 'radio', 'button', 'submit', 'reset', 'hidden'].includes(el.type))) {
        const prototype = el.localName === 'textarea' ? view.HTMLTextAreaElement.prototype : view.HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(prototype, 'value').set.call(el, text);
      } else if (el.isContentEditable) el.textContent = text;
      else throw new Error('Element is not an editable text field. File uploads are unsupported.');
      input(); change();
    };
    switch (action.action) {
      case 'click': el.click(); break;
      case 'fill': fill(action.text); break;
      case 'select': {
        if (el.localName !== 'select') throw new Error('Element is not a select.');
        const option = Array.from(el.options).find((o) => o.value === action.value && !o.disabled);
        if (!option) throw new Error('Select option does not exist or is disabled.');
        el.value = action.value; input(); change(); break;
      }
      case 'key': {
        const proceed = el.dispatchEvent(new view.KeyboardEvent('keydown', { key: action.key, bubbles: true, cancelable: true, composed: true }));
        if (proceed) {
          if (action.key === 'Enter' && el.form && el.localName !== 'textarea') el.form.requestSubmit();
          else if ((action.key === 'Enter' || action.key === ' ') && ['button', 'a', 'summary'].includes(el.localName)) el.click();
          else if (action.key === 'Tab') {
            const nodes = Array.from(el.ownerDocument.querySelectorAll('a[href],button,input,textarea,select,[tabindex]')).filter((node) => !node.disabled && node.tabIndex >= 0 && visible(node));
            nodes[(nodes.indexOf(el) + 1) % nodes.length]?.focus();
          } else if (['Backspace', 'Delete'].includes(action.key) && typeof el.selectionStart === 'number') {
            const start = el.selectionStart, end = el.selectionEnd;
            const from = start === end && action.key === 'Backspace' ? Math.max(0, start - 1) : start;
            const to = start === end && action.key === 'Delete' ? end + 1 : end;
            fill(el.value.slice(0, from) + el.value.slice(to));
            el.setSelectionRange(from, from);
          }
        }
        el.dispatchEvent(new view.KeyboardEvent('keyup', { key: action.key, bubbles: true, composed: true }));
        break;
      }
      default: throw new Error('Unsupported page action.');
    }
    return JSON.stringify({ ok: true, synthetic: true });
  } catch (error) { return JSON.stringify({ error: String(error.message || error) }); }
}
