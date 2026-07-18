import i18next from "i18next";

const resources = {
  en: {
    translation: {
      errors: {
        unhandled: "An unexpected error occurred.",
        invalidInput: "Invalid input",
        report: "Please report this problem to us: {{supportLink}}",
      },
    },
  },
  ja: {
    translation: {
      errors: {
        unhandled: "予期しないエラーが発生しました。",
        invalidInput: "入力が正しくありません",
        report: "この問題を報告してください: {{supportLink}}",
      },
    },
  },
} as const;

const instance = i18next.createInstance();
await instance.init({
  fallbackLng: "en",
  interpolation: { escapeValue: false },
  resources,
});

export function getFixedT(locale: string) {
  return instance.getFixedT(locale);
}
