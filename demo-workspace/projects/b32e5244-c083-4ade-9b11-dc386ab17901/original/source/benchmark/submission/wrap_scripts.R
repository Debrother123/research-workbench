

#------------------------------------------------------------------------------------------------------

prepare_perturbation_data <- function(params, duration = "01:00:00", memory = "40GB"){
  MyWorkflowManager::wrap_script("src/prepare_perturbation_data.py", params = params, executor = "python", 
                                 extra_args = "gears_env2", duration = duration, memory = memory)
}

geneformer_prediction <- function(params, dep_jobs, duration = "50:00:00", memory = "120GB"){
  MyWorkflowManager::wrap_script("src/run_geneformer.py", params = params, 
                                 dependencies = dep_jobs, executor = "python", 
                                 extra_args = "geneformer_env",
                                 extra_slurm_arg = "--constraint=\"[gpu=H100|gpu=Mi210]\" -p gpu-el8 --gpus 1 --ntasks-per-gpu 1",
                                 duration = duration, memory = memory)
}

uce_prediction <- function(params, dep_jobs, duration = "30:00:00", memory = "120GB"){
  MyWorkflowManager::wrap_script("src/run_uce.py", params = params, 
                                 dependencies = dep_jobs, executor = "python", 
                                 extra_args = "uce_env",
                                 extra_slurm_arg = "--constraint=\"[gpu=A40|gpu=L40s|gpu=H100|gpu=A100]\" -p gpu-el8 --gpus 1 --ntasks-per-gpu 1",
                                 duration = duration, memory = memory)
}

scbert_prediction <- function(params, dep_jobs, duration = "30:00:00", memory = "120GB"){
  MyWorkflowManager::wrap_script("src/run_scbert.py", params = params, 
                                 dependencies = dep_jobs, executor = "python", 
                                 extra_args = "scbert_env",
                                 extra_slurm_arg = "-C gaming  -p gpu-el8 --gpus 1 --ntasks-per-gpu 1",
                                 duration = duration, memory = memory)
}


cpa_prediction <- function(params, dep_jobs, duration = "16:00:00", memory = "120GB"){
  MyWorkflowManager::wrap_script("src/run_cpa.py", params = params, 
                                 dependencies = dep_jobs, executor = "python", 
                                 extra_args = "cpa_env3",
                                 extra_slurm_arg = "-C gaming -p gpu-el8 --gpus 1 --ntasks-per-gpu 1",
                                 duration = duration, memory = memory)
}

scgpt_combinatorial_prediction <- function(params, dep_jobs, duration = "10:00:00", memory = "40GB"){
  MyWorkflowManager::wrap_script("src/run_scgpt.py", params = params, 
                                 dependencies = dep_jobs, executor = "python", 
                                 extra_args = "flashattn_env",
                                 extra_slurm_arg = "--constraint=\"[gpu=A40|gpu=L40s|gpu=H100|gpu=A100]\" -p gpu-el8 --gpus 1 --ntasks-per-gpu 1",
                                 duration = duration, memory = memory)
}

scgpt_extract_embedding <- function(duration = "00:30:00", memory = "40GB"){
  params <- list()
  names(params) <- character(0L)
  MyWorkflowManager::wrap_script("src/extract_gene_embedding_scgpt.py", params = params,
                                 executor = "python", 
                                 extra_args = "flashattn_env",
                                 extra_slurm_arg = "-C gaming  -p gpu-el8 --gpus 1 --ntasks-per-gpu 1",
                                 duration = duration, memory = memory)
}

scfoundation_extract_embedding <- function(duration = "00:30:00", memory = "40GB"){
  params <- list()
  names(params) <- character(0L)
  MyWorkflowManager::wrap_script("src/extract_gene_embedding_scfoundation.py", params = params,
                                 executor = "python", 
                                 extra_args = "scfoundation_env",
                                 extra_slurm_arg = "-C gaming  -p gpu-el8 --gpus 1 --ntasks-per-gpu 1",
                                 duration = duration, memory = memory)
}

pca_extract_pert_embedding <- function(params, dep_jobs = list(), duration = "00:30:00", memory = "40GB"){
  MyWorkflowManager::wrap_script("src/extract_pert_embedding_pca.R", executor = "R", 
                                 params = params, duration = duration, memory = memory)
}

gears_extract_pert_embedding <- function(params, dep_jobs = list(), duration = "01:00:00", memory = "60GB"){
  MyWorkflowManager::wrap_script("src/extract_pert_embedding_from_gears.R", params = params, 
                                 dependencies = dep_jobs, executor = "R", 
                                 duration = duration, memory = memory)
}

gears_combinatorial_prediction <- function(params, dep_jobs, duration = "10:00:00", memory = "40GB"){
  MyWorkflowManager::wrap_script("src/run_gears.py", params = params, 
                                 dependencies = dep_jobs, executor = "python", 
                                 extra_args = "gears_env2",
                                 extra_slurm_arg = "-C gaming  -p gpu-el8 --gpus 1 --ntasks-per-gpu 1",
                                 duration = duration, memory = memory)
}

scfoundation_combinatorial_prediction <- function(params, dep_jobs, duration = "5-00:00:00", memory = "80GB"){
  MyWorkflowManager::wrap_script("src/run_scfoundation.py", params = params, 
                                 dependencies = dep_jobs, executor = "python", 
                                 extra_args = "scfoundation_env",
                                 extra_slurm_arg = "--constraint=\"[gpu=A40|gpu=L40s|gpu=H100]\"  -p gpu-el8 --gpus 1 --ntasks-per-gpu 1",
                                 duration = duration, memory = memory)
}

additive_model_combinatorial_prediction <- function(params, dep_jobs, duration = "01:00:00", memory = "40GB"){
  MyWorkflowManager::wrap_script("src/run_additive_model.py", params = params, 
                                 dependencies = dep_jobs, executor = "python", 
                                 extra_args = "gears_env2",
                                 duration = duration, memory = memory)
}

ground_truth_combinatorial_prediction <- function(params, dep_jobs, duration = "01:00:00", memory = "40GB"){
  MyWorkflowManager::wrap_script("src/run_ground_truth_for_combinatorial_perturbations.py", params = params, 
                                 dependencies = dep_jobs, executor = "python", 
                                 extra_args = "gears_env2",
                                 duration = duration, memory = memory)
}


mean_prediction <- function(params, dep_jobs, duration = "03:00:00", memory = "60GB"){
  MyWorkflowManager::wrap_script("src/run_mean_prediction.R", params = params, 
                                 dependencies = dep_jobs, executor = "R", 
                                 duration = duration, memory = memory)
}

linear_pretrained_model_prediction <- function(params, dep_jobs, duration = "03:00:00", memory = "60GB"){
  MyWorkflowManager::wrap_script("src/run_linear_pretrained_model.R", params = params, 
                                 dependencies = dep_jobs, executor = "R", 
                                 duration = duration, memory = memory)
}

transfer_perturbation_prediction <- function(params, dep_jobs, duration = "03:00:00", memory = "60GB"){
  MyWorkflowManager::wrap_script("src/run_transfer_perturbation_prediction.R", params = params, 
                                 dependencies = dep_jobs, executor = "R", 
                                 duration = duration, memory = memory)
}

collect_perturbation_predictions <- function(params, dep_jobs, duration = "03:00:00", memory = "60GB"){
  MyWorkflowManager::wrap_script("src/collect_perturbation_predictions.R", params = params, 
                                 dependencies = dep_jobs, executor = "R", 
                                 duration = duration, memory = memory)
}