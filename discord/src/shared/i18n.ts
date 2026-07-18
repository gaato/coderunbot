/**
 * Owns shared translation resources and request-scoped translator creation.
 */
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
        source:
          "This bot is free software licensed under the GNU AGPL v3 or later. The full source code is available at {{url}}",
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
      code: {
        supportedLanguagesHeading: "The following languages are supported",
        noLanguagesAvailable:
          "The language list is temporarily unavailable. Please try again later.",
        resultHeading: "Result ({{compiler}})",
        codeHeading: "Code",
        modal: {
          title: "Run code",
          codeLabel: "Code",
          codePlaceholder: "Write code here",
          stdinLabel: "Standard Input",
        },
        errors: {
          heading: "Wandbox Error",
          connection: "Could not connect to Wandbox. Please try again later.",
          http: "Wandbox returned HTTP status {{status}}.",
          nonJson:
            "Wandbox returned a non-JSON response. Please check the service status and try again later.",
          responsePreview: "Response Preview",
        },
      },
      wolfram: {
        errorHeading: "Wolfram|Alpha Error",
        notUnderstood: "Wolfram|Alpha could not understand that input.",
        noResults: "Wolfram|Alpha returned no result pages.",
      },
      translate: {
        invalidLanguage:
          "Invalid language. Enter an ISO 639-1 code or language name.",
        originalHeading: "Original",
        translatedHeading: "Translated to {{language}}",
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
        source:
          "このボットは GNU AGPL v3 以降のライセンスで公開されている自由ソフトウェアです。ソースコードはこちら: {{url}}",
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
      code: {
        supportedLanguagesHeading: "対応している言語",
        noLanguagesAvailable:
          "言語一覧を一時的に取得できません。しばらくしてからもう一度お試しください。",
        resultHeading: "実行結果 ({{compiler}})",
        codeHeading: "コード",
        modal: {
          title: "コードを実行",
          codeLabel: "コード",
          codePlaceholder: "コードを入力してください",
          stdinLabel: "標準入力",
        },
        errors: {
          heading: "Wandbox エラー",
          connection:
            "Wandbox に接続できませんでした。しばらくしてからもう一度お試しください。",
          http: "Wandbox が HTTP ステータス {{status}} を返しました。",
          nonJson:
            "Wandbox から JSON ではない応答が返されました。サービスの状態を確認して、しばらくしてからもう一度お試しください。",
          responsePreview: "応答のプレビュー",
        },
      },
      wolfram: {
        errorHeading: "Wolfram|Alpha エラー",
        notUnderstood: "Wolfram|Alpha は、その入力を理解できませんでした。",
        noResults: "Wolfram|Alpha から結果ページが返されませんでした。",
      },
      translate: {
        invalidLanguage:
          "無効な言語です。ISO 639-1 の2文字コードまたは言語名を入力してください。",
        originalHeading: "原文",
        translatedHeading: "翻訳結果（{{language}}）",
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
  // A fixed translator avoids global changeLanguage calls bleeding across concurrent requests.
  return instance.getFixedT(locale);
}
