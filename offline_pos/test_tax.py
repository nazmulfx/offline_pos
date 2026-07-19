import frappe
from offline_pos.api import get_print_format_template

def test():
    res = get_print_format_template("Standard Print format")
    html = res["html"]
    start_idx = html.find("___MODE_OF_PAYMENT___")
    if start_idx != -1:
        print("Payments segment in HTML:")
        print(html[start_idx-200 : start_idx+300])
    else:
        print("___MODE_OF_PAYMENT___ not found in Standard Print format!")

    res2 = get_print_format_template("POS Invoice with Due Feature")
    html2 = res2["html"]
    start_idx2 = html2.find("___MODE_OF_PAYMENT___")
    if start_idx2 != -1:
        print("Payments segment in POS Invoice with Due Feature:")
        print(html2[start_idx2-200 : start_idx2+300])
    else:
        print("___MODE_OF_PAYMENT___ not found in POS Invoice with Due Feature!")
