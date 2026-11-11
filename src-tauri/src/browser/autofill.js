// Native-only arguments, evaluated in the isolated client world and the top document.
({ origin, username, email, password }) => {
  const fail = () => JSON.stringify({ error: 'Secure login filling was refused. Check the origin and login fields.' });
  try {
    if (window !== window.top || location.origin !== origin || location.protocol !== 'https:') return fail();
    const visible = (el) => {
      const rect = el.getBoundingClientRect(), style = getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    // Deliberately ignore frames, shadow roots, selectors, and agent-supplied field/value mappings.
    const inputs = Array.from(document.querySelectorAll('input')).filter((el) => visible(el) && !el.disabled && !el.readOnly);
    const autocomplete = (el, token) => el.autocomplete.split(/\s+/).includes(token);
    const passwords = inputs.filter((el) => el.type === 'password');
    if (passwords.length !== 1 || autocomplete(passwords[0], 'new-password')) return fail();
    const passwordField = passwords[0], form = passwordField.form;
    const sameOriginAction = (value) => {
      const url = new URL(value || location.href, document.baseURI);
      return url.protocol === 'https:' && url.origin === origin && !url.username && !url.password;
    };
    // Read attributes, not named form properties: <input name="action"> can clobber form.action.
    if (!form || form.getAttribute('method')?.toLowerCase() !== 'post' || !sameOriginAction(form.getAttribute('action'))) return fail();
    const target = form.getAttribute('target') || document.querySelector('base[target]')?.getAttribute('target');
    if (target && !['_self', '_top'].includes(target)) return fail();
    const controls = Array.from(document.querySelectorAll('input,button')).filter((el) => el.form === form);
    if (controls.some((el) => (el.hasAttribute('formaction') && !sameOriginAction(el.getAttribute('formaction')))
      || (el.hasAttribute('formmethod') && el.getAttribute('formmethod').toLowerCase() !== 'post')
      || (el.hasAttribute('formtarget') && !['_self', '_top'].includes(el.getAttribute('formtarget'))))) return fail();
    const fields = inputs.filter((el) => el.form === form && ['text', 'email'].includes(el.type));
    const emailFields = fields.filter((el) => el.type === 'email' || autocomplete(el, 'email'));
    const userFields = fields.filter((el) => !emailFields.includes(el) && (autocomplete(el, 'username') || /^(user(name)?|login)$/i.test(el.name || el.id)));
    if (emailFields.length > 1 || userFields.length > 1) return fail();
    const assignments = [[passwordField, password]];
    if (emailFields.length) { if (!email) return fail(); assignments.push([emailFields[0], email]); }
    if (userFields.length) { if (!username && !email) return fail(); assignments.push([userFields[0], username || email]); }
    if (assignments.length === 1) return fail();
    if (location.origin !== origin) return fail();
    // Assign everything before events: a page listener cannot redirect subsequent secret assignments.
    globalThis.__lotseCredentialFields ||= new WeakSet();
    for (const [field] of assignments) globalThis.__lotseCredentialFields.add(field);
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    for (const [field, value] of assignments) setter.call(field, value);
    for (const [field] of assignments) {
      field.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      field.dispatchEvent(new Event('change', { bubbles: true }));
    }
    // Submission remains an explicit website/user action. Never return page-controlled data.
    return JSON.stringify({ filled: true, fieldsFilled: assignments.length });
  } catch { return fail(); }
}
