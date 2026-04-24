import axios from "axios";

export const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

const api = axios.create({
  baseURL: API,
  withCredentials: true,
});

export default api;

export const imgSrc = (img) => {
  if (!img) return null;
  if (typeof img === "string") return img.startsWith("data:") ? img : `data:image/png;base64,${img}`;
  const mime = img.mime_type || "image/png";
  return img.data_base64.startsWith("data:") ? img.data_base64 : `data:${mime};base64,${img.data_base64}`;
};

export const formatPrice = (v) =>
  typeof v === "number" ? `$${v.toFixed(2)}` : "$0.00";
