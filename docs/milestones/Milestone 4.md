# Milestone 4: Reporting API, export formats

Deadline **June 16, 2026**

# Goals

## Must

* Create REST Reporting API  
* CSV and PDF export functional from the dashboard date-range picker

## Should

* Implement Data Retention and Data Deletion policies with retention/deletion workflow

## Could

* Verification mechanisms:  
  * Data Retention: Automated scripts run daily to delete data older than 30 days. Logs of deletion events are stored in data-lifecycle.log for audit.  
  * Data Deletion: A final "data wipe" script is documented and executed post-demo, with a cryptographically signed log confirming deletion.  
* Test suite (unit and integration testing)

# Deliverables

* Dashboard date-range picker  
* HTTP GET /report  
* Reporting API  
* MongoDB aggregation  
* CSV / PDF download

# Key Challenges

* Testing aggregation pipelines for bigger ranges (e.g. 1-month)

# Resources Needed

* Specific tools, information, or support required to complete this milestone.

