import i18next from "i18next";

const resources = {
  en: {
    translation: {
      errors: {
        unhandled: "An unexpected error occurred.",
        invalidInput: "Invalid input",
        report: "Please report this problem to us: {{supportLink}}",
      },
      privacy: {
        optOut: {
          already:
            "Your message content is already off-track. To use other commands, please use the /opt-in command.",
          success:
            "This bot will not track your message content from now on. Most commands will no longer respond.",
        },
        optIn: {
          already: "This bot is already tracking your message content.",
          success:
            "This bot will now track the content of your messages. It will only be used to provide commands. Use the /privacy-policy command to view the privacy policy.",
        },
      },
      tex: {
        hintHeading: "Hint",
        multilineHint: "You can use the gather or align environment.",
        codeHeading: "Code",
        errorHeading: "Rendering Error",
        modal: {
          title: "LaTeX to Image",
          codeLabel: "Code",
          codePlaceholder: "Enter TeX code here",
        },
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
      privacy: {
        optOut: {
          already:
            "メッセージ内容はすでに処理対象外です。他のコマンドを使用するには /opt-in コマンドを使用してください。",
          success:
            "今後、このボットはあなたのメッセージ内容を処理しません。ほとんどのコマンドは応答しなくなります。",
        },
        optIn: {
          already: "このボットはすでにあなたのメッセージ内容を処理しています。",
          success:
            "このボットは今後、あなたのメッセージ内容をコマンド提供のためだけに処理します。プライバシーポリシーは /privacy-policy コマンドで確認できます。",
        },
      },
      tex: {
        hintHeading: "ヒント",
        multilineHint: "gather または align 環境を利用できます。",
        codeHeading: "コード",
        errorHeading: "レンダリングエラー",
        modal: {
          title: "LaTeX を画像に変換",
          codeLabel: "コード",
          codePlaceholder: "TeX コードを入力してください",
        },
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
