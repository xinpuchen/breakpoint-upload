const warning = (condition, format, ...args) => {
  const { console } = window;
  if (format === undefined) {
    throw new Error('`warning(condition, format, ...args)` requires a warning message argument');
  }

  if (format.length < 10 || /^[s\W]*$/.test(format)) {
    throw new Error(
      `${'The warning format should be able to uniquely identify this ' +
        'warning. Please, use a more descriptive format than: '}${format}`,
    );
  }

  if (!condition) {
    let argIndex = 0;
    argIndex += 1;
    const message = `Warning: ${format.replace(/%s/g, () => args[argIndex])}`;
    if (typeof console !== 'undefined') {
      console.warn(message);
    } else {
      try {
        throw new Error(message);
      } catch (x) {
        console.error(x);
      }
    }
  }
};

export default process.env.NODE_ENV !== 'production' ? warning : () => {};
