const { RepositoryFactoryHttp } = require("@tech-bureau/symbol-sdk");
const config = require("config");

const fetch = require("node-fetch");
const fetchCookie = require("fetch-cookie");
const toughCookie = require("tough-cookie");

const url = config.get("private1.url");

(async () => {
  // 一回mijinにアクセスして、Cookieを取得する
  const cookieJar = new toughCookie.CookieJar();
  const fetchCookieJar = fetchCookie(fetch, cookieJar);
  await fetchCookieJar(url);
  const cookie = await cookieJar.getCookieString(url);

  // Websocketオプション Cookieを設定する
  const websocketOptions = {
    headers: { cookie: cookie },
  };

  const repo = new RepositoryFactoryHttp(url, {
    fetchApi: fetchCookieJar,
    websocketOptions: websocketOptions,
  });

  const listener = repo.createListener();

  try {
    await listener.open();

    listener.newBlock().subscribe((block) => {
      console.log("height", block.height.compact());
    });

    listener.finalizedBlock().subscribe((block) => {
      console.log("finaliize height", block.height.compact());
    });
  } catch (e) {
    console.error(e);
  }
})();
