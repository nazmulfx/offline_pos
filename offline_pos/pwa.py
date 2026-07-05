import os
import frappe
from werkzeug.wrappers import Response
from frappe.website.page_renderers.base_renderer import BaseRenderer

class PWARenderer(BaseRenderer):
	def __init__(self, path, http_status_code=None):
		super().__init__(path=path, http_status_code=http_status_code)

	def can_render(self):
		if not getattr(frappe.local, "request", None):
			return False
		req_path = frappe.local.request.path.strip("/")
		if req_path in ("offline-pos/sw.js", "offline-pos/manifest.webmanifest"):
			return True
		if req_path.startswith("offline-pos/workbox-") and req_path.endswith(".js"):
			return True
		return False

	def render(self):
		req_path = frappe.local.request.path.strip("/")
		filename = req_path.split("/")[-1]
		file_path = frappe.get_app_path("offline_pos", "public", "offline-pos", filename)

		if not os.path.exists(file_path):
			from werkzeug.exceptions import NotFound
			raise NotFound()

		with open(file_path, "rb") as f:
			content = f.read()

		response = Response(content, status=self.http_status_code or 200)
		if filename == "sw.js" or filename.startswith("workbox-"):
			response.mimetype = "application/javascript"
			if filename == "sw.js":
				response.headers["Service-Worker-Allowed"] = "/offline-pos/"
		elif filename == "manifest.webmanifest":
			response.mimetype = "application/manifest+json"

		response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
		return response
