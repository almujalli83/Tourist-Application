import { cookies } from "next/headers";
import { getDictionary, type Dictionary } from ".";
import { type Locale, UI_COOKIE, uiLangFor } from "./config";

/** The dictionary for a server-rendered page: the page's locale in the viewer's interface language. */
export async function pageDictionary(locale: Locale): Promise<Dictionary> {
  const store = await cookies();
  return getDictionary(locale, uiLangFor(locale, store.get(UI_COOKIE)?.value));
}
