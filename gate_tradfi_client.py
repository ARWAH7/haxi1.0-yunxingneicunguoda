import hashlib
import hmac
import json
import time
from typing import Any, Dict, Optional
from urllib.parse import urlencode

import requests


class GateTradFiClient:
    """Gate TradFi Python client.

    Key behavior implemented:
    - Always send KEY and Timestamp for every request (public/private).
    - Timestamp used in header is the exact same value used in SIGN generation.
    - SIGN header is only attached when auth=True.
    """

    def __init__(
        self,
        api_key: str,
        api_secret: str = "",
        base_url: str = "https://api.gateio.ws/api/v4",
        timeout: int = 15,
        session: Optional[requests.Session] = None,
    ) -> None:
        self.api_key = api_key
        self.api_secret = api_secret
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.session = session or requests.Session()

    @staticmethod
    def _body_to_json(data: Optional[Dict[str, Any]]) -> str:
        if not data:
            return ""
        return json.dumps(data, separators=(",", ":"), ensure_ascii=False)

    @staticmethod
    def _sha512_hex(value: str) -> str:
        return hashlib.sha512(value.encode("utf-8")).hexdigest()

    def _gen_sign(
        self,
        method: str,
        path: str,
        query_string: str,
        body: str,
        timestamp: str,
    ) -> str:
        payload_hash = self._sha512_hex(body)
        sign_payload = "\n".join([
            method.upper(),
            path,
            query_string,
            payload_hash,
            timestamp,
        ])
        return hmac.new(
            self.api_secret.encode("utf-8"),
            sign_payload.encode("utf-8"),
            hashlib.sha512,
        ).hexdigest()

    def _build_headers(
        self,
        method: str,
        path: str,
        query_string: str,
        body: str,
        auth: bool,
    ) -> Dict[str, str]:
        # Timestamp is generated once and reused for header + signature.
        timestamp = str(int(time.time()))
        headers: Dict[str, str] = {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "Timestamp": timestamp,
            "KEY": self.api_key,
        }
        if auth:
            if not self.api_secret:
                raise ValueError("api_secret is required when auth=True")
            headers["SIGN"] = self._gen_sign(
                method=method,
                path=path,
                query_string=query_string,
                body=body,
                timestamp=timestamp,
            )
        return headers

    def _request(
        self,
        method: str,
        path: str,
        *,
        params: Optional[Dict[str, Any]] = None,
        data: Optional[Dict[str, Any]] = None,
        auth: bool = False,
    ) -> Any:
        method = method.upper()
        query_string = urlencode(params or {}, doseq=True)
        body = self._body_to_json(data)

        headers = self._build_headers(
            method=method,
            path=path,
            query_string=query_string,
            body=body,
            auth=auth,
        )

        url = f"{self.base_url}{path}"
        response = self.session.request(
            method=method,
            url=url,
            params=params,
            data=body if body else None,
            headers=headers,
            timeout=self.timeout,
        )

        if response.status_code >= 400:
            try:
                error_data = response.json()
            except ValueError:
                error_data = response.text
            raise RuntimeError(f"HTTP {response.status_code}: {error_data}")

        if not response.content:
            return None

        try:
            return response.json()
        except ValueError:
            return response.text

    # ---- API methods requested ----
    def get_mt5_account(self) -> Any:
        return self._request("GET", "/tradfi/users/mt5-account", auth=False)

    def get_symbols(self) -> Any:
        return self._request("GET", "/tradfi/symbols", auth=False)

    def get_symbol_detail(self, symbol: str) -> Any:
        return self._request("GET", f"/tradfi/symbols/{symbol}", auth=False)

    def get_ticker(self, symbol: str) -> Any:
        return self._request("GET", f"/tradfi/tickers/{symbol}", auth=False)

    def get_assets(self) -> Any:
        return self._request("GET", "/tradfi/accounts/assets", auth=True)

    def place_order(
        self,
        symbol: str,
        side: str,
        volume: float,
        order_type: str = "market",
        price: Optional[float] = None,
        **extra_fields: Any,
    ) -> Any:
        payload: Dict[str, Any] = {
            "symbol": symbol,
            "side": side,
            "volume": volume,
            "type": order_type,
        }
        if price is not None:
            payload["price"] = price
        payload.update(extra_fields)
        return self._request("POST", "/tradfi/orders", data=payload, auth=True)

    def get_positions(self, symbol: Optional[str] = None) -> Any:
        params = {"symbol": symbol} if symbol else None
        return self._request("GET", "/tradfi/positions", params=params, auth=True)

    def close_position_full(self, position_id: str) -> Any:
        return self._request(
            "POST",
            f"/tradfi/positions/{position_id}/close",
            data={"close_type": "full"},
            auth=True,
        )


if __name__ == "__main__":
    # Example usage
    client = GateTradFiClient(api_key="YOUR_KEY", api_secret="YOUR_SECRET")
    print(client.get_mt5_account())
