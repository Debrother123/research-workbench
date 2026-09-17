#!/bin/sh

rig run --r-version 4.4-arm64 -e "rmarkdown::render('notebooks/single_perturbation_analysis.Rmd', output_format = 'html_document')"
rig run --r-version 4.4-arm64 -e "rmarkdown::render('notebooks/double_perturbation_analysis.Rmd', output_format = 'html_document')"
rig run --r-version 4.4-arm64 -e "rmarkdown::render('notebooks/dataset_overview.Rmd', output_format = 'html_document')"
