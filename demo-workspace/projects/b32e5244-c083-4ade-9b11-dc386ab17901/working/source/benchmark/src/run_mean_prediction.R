library(SingleCellExperiment)
library(tidyverse)
Sys.setenv("BASILISK_EXTERNAL_CONDA"="/g/easybuild/x86_64/Rocky/8/haswell/software/Miniforge3/24.1.2-0")

pa <- argparser::arg_parser("Run model that always just predicts the mean across conditions")
pa <- argparser::add_argument(pa, "--dataset_name", type = "character", help = "The name of the dataset") 
pa <- argparser::add_argument(pa, "--test_train_config_id", type = "character", help = "The ID of the test/train/holdout run") 
pa <- argparser::add_argument(pa, "--seed", type = "integer", default = 1, nargs = 1, help = "The seed")

pa <- argparser::add_argument(pa, "--working_dir", type = "character", help = "The directory that contains the params, results, scripts etc.")
pa <- argparser::add_argument(pa, "--result_id", type = "character", help = "The result_id")
pa <- argparser::parse_args(pa)
# pa <- argparser::parse_args(pa, argv = r"(
#                             --dataset_name adamson
#                             --test_train_config_id ede703be5dd78-42650ea02bb4f
#                             --working_dir /scratch/ahlmanne/perturbation_prediction_benchmark
# )" |> stringr::str_trim() |> stringr::str_split("\\s+"))

print(pa)
set.seed(pa$seed)

out_dir <- file.path(pa$working_dir, "results/", pa$result_id)
# ---------------------------------------

# Load data
folder <- "data/gears_pert_data"
sce <- zellkonverter::readH5AD(file.path(folder, pa$dataset_name, "perturb_processed.h5ad"))
set2condition <- rjson::fromJSON(file = file.path(pa$working_dir, "results", pa$test_train_config_id))
if(! "ctrl" %in% set2condition$train){
  set2condition$train <- c(set2condition$train, "ctrl")
}

# Only keep valid condtions
sce <- sce[,sce$condition %in% unlist(set2condition)]

# Clean up the colData(sce) a bit
sce$condition <- droplevels(sce$condition)
sce$clean_condition <- stringr::str_remove(sce$condition, "\\+ctrl")
training_df <- tibble(training = names(set2condition), condition = set2condition) %>%
  unnest(condition)
colData(sce) <- colData(sce) %>%
  as_tibble() %>%
  tidylog::left_join(training_df, by = "condition") %>%
  DataFrame()

gene_names <- rowData(sce)[["gene_name"]]
rownames(sce) <- gene_names


# Pseudobulk everything
psce <- glmGamPoi::pseudobulk(sce, group_by = vars(condition, clean_condition, training))

# Calculate mean across training
mean_across_training <- MatrixGenerics::rowMeans2(assay(psce, "X")[,psce$training == "train",drop=FALSE])

# Bring into right format
pred <- replicate(nrow(psce), unname(mean_across_training), simplify = FALSE)
names(pred) <- psce$clean_condition

# Store output
tmp_out_dir <- file.path(tempdir(), "prediction_storage")
dir.create(tmp_out_dir)
write_lines(rjson::toJSON(pred), file.path(tmp_out_dir, "all_predictions.json"))
write_lines(rjson::toJSON(rownames(psce)), file.path(tmp_out_dir, "gene_names.json"))
file.rename(tmp_out_dir,out_dir)


#### Session Info
sessionInfo()


