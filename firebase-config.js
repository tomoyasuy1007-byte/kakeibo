// Firebase の接続情報。公開しても問題ない値で、データの保護は firestore.rules で行う。
export const firebaseConfig = {
  apiKey: "AIzaSyAvADUZXxq36O2KwNydSZ0KPBWY0ByNUzE",
  authDomain: "kakeibo-75f8a.firebaseapp.com",
  projectId: "kakeibo-75f8a",
  storageBucket: "kakeibo-75f8a.firebasestorage.app",
  messagingSenderId: "844093440898",
  appId: "1:844093440898:web:5e71552cf7c1827a6ac59b"
};

// 家計簿のアドレス。Google ログインの戻り先（authDomain）と同じドメインにする。
export const APP_URL = "https://kakeibo-75f8a.firebaseapp.com/";
