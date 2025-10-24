import { whois } from "@cleandns/whois-rdap";

whois("olha.la")
  .then((response) => {
    console.log(response);
  })
  .catch((error) => {
    console.error(error);
  });
