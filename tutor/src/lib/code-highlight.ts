import { useEffect, useState } from "react";
import Prism from "prismjs";

let pythonLoading: Promise<void> | undefined;

export function useHighlightedCode(code: string, language: string) {
  const [, setLoaded] = useState(false);
  useEffect(() => {
    if (language !== "python" || Prism.languages.python) return;
    let active = true;
    // Prism registers its global when imported. Load the grammar after that,
    // since the grammar script reads this global as soon as it is evaluated.
    pythonLoading ??= import("prismjs/components/prism-python").then(() => {});
    void pythonLoading.then(() => {
      if (active) setLoaded(true);
    }).catch(() => {
      // Plain code remains readable if the optional grammar cannot load.
    });
    return () => { active = false; };
  }, [language]);
  const grammar = Prism.languages[language];
  return grammar ? Prism.highlight(code, grammar, language) : null;
}
