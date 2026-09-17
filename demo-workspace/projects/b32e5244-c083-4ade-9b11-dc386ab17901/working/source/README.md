# Code repository for *Deep learning-based predictions of gene perturbation effects do not yet outperform simple linear baselines*

This repository contains the code to reproduce our analysis from

> Deep learning-based predictions of gene perturbation effects do not yet outperform simple linear baselines. 
Constantin Ahlmann-Eltze, Wolfgang Huber, Simon Anders.
_Nature Methods_ 2025; doi: https://doi.org/10.1038/s41592-025-02772-6

A copy of the code is permanently archived at https://doi.org/10.5281/zenodo.14832393.

- The **notebooks** folder contains the R scripts used for the analysis and to make the figures
  - [Double Perturbation Analysis](https://htmlpreview.github.io/?https://github.com/const-ae/linear_perturbation_prediction-Paper/blob/main/notebooks/double_perturbation_analysis.html)
  - [Single Perturbation Analysis](https://htmlpreview.github.io/?https://github.com/const-ae/linear_perturbation_prediction-Paper/blob/main/notebooks/single_perturbation_analysis.html)
  - [Dataset Overview](https://htmlpreview.github.io/?https://github.com/const-ae/linear_perturbation_prediction-Paper/blob/main/notebooks/dataset_overview.html)
- The **benchmark** folder contains the scripts to reproduce the benchmark results
  - The **benchmark/src** contains individual scripts to run each method
  - The **benchmark/conda_environments** and **benchmark/renv** contain the details about the software versions
  - The **benchmark/submission** contains the script to launch the scripts using my [custom](https://github.com/const-ae/MyWorkflowManager) workflow manager
