import axios from "axios";

export const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

const api = axios.create({ baseURL: API, withCredentials: true });

export default api;

export const imgSrc = (img) => {
  if (!img) return null;
  if (typeof img === "string") {
    if (img.startsWith("data:") || img.startsWith("http") || img.startsWith("blob:")) return img;
    if (img.startsWith("/")) return `${BACKEND_URL}${img}`;
    return `data:image/png;base64,${img}`;
  }
  if (img.url) return `${BACKEND_URL}${img.url}`;
  if (img.data_base64) {
    const mime = img.mime_type || "image/png";
    return img.data_base64.startsWith("data:") ? img.data_base64 : `data:${mime};base64,${img.data_base64}`;
  }
  return null;
};

let _currency = "LKR";
export const setCurrency = (c) => { _currency = c || "LKR"; };
const symbolMap = { USD: "$", EUR: "€", GBP: "£", LKR: "Rs ", INR: "₹", AUD: "A$" };
export const formatPrice = (v) => {
  if (typeof v !== "number") return `${symbolMap[_currency] || _currency + " "}0.00`;
  const s = symbolMap[_currency] || `${_currency} `;
  return `${s}${v.toFixed(2)}`;
};
