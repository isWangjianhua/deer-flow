type BuildBffMeRequestInput = {
  baseURL: string;
  idToken: string;
};

export function buildBffMeRequest({
  baseURL,
  idToken,
}: BuildBffMeRequestInput) {
  return {
    url: `${baseURL.replace(/\/+$/, "")}/me`,
    init: {
      headers: new Headers({
        Authorization: `Bearer ${idToken}`,
      }),
    },
  };
}
