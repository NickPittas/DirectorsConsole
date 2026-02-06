"""Export manager for Storyboard Maker.

Handles exporting panels to various formats (PNG, JPEG, WebP, PDF, CSV).
"""

import csv
import json
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from PIL import Image

logger = logging.getLogger(__name__)


@dataclass
class ExportOptions:
    """Options for exporting panels.

    Attributes:
        format: Export format (png, jpeg, webp, pdf, csv).
        quality: Quality setting for lossy formats (1-100).
        lossless: Whether to use lossless compression.
        include_metadata: Whether to include panel metadata in export.
        pdf_grid_cols: Number of columns in PDF grid layout.
        pdf_grid_rows: Number of rows in PDF grid layout.
        include_notes: Whether to include panel notes in PDF export.
    """
    format: str = "png"
    quality: int = 95
    lossless: bool = True
    include_metadata: bool = True
    pdf_grid_cols: int = 2
    pdf_grid_rows: int = 3
    include_notes: bool = True


class ExportError(Exception):
    """Base exception for export-related errors."""
    pass


class ExportManager:
    """Manages exporting storyboard panels to various formats.

    Supports PNG, JPEG, WebP for images, PDF for layouts,
    and CSV for metadata.
    """

    SUPPORTED_FORMATS = ["png", "jpeg", "webp", "pdf", "csv"]

    def __init__(self, output_dir: Path | None = None) -> None:
        """Initialize the export manager.

        Args:
            output_dir: Default output directory for exports.
        """
        self.output_dir = output_dir or Path("output")
        self.output_dir.mkdir(parents=True, exist_ok=True)

    def export_panel(
        self,
        image_path: Path,
        output_name: str,
        options: ExportOptions | None = None,
    ) -> Path:
        """Export a single panel.

        Args:
            image_path: Path to the source image.
            output_name: Base name for the output file.
            options: Export options.

        Returns:
            Path to the exported file.

        Raises:
            ExportError: If export fails.
        """
        if options is None:
            options = ExportOptions()

        if options.format == "pdf":
            return self._export_pdf([image_path], output_name, options)
        else:
            return self._export_image(image_path, output_name, options)

    def export_panels(
        self,
        image_paths: list[Path],
        output_name: str,
        options: ExportOptions | None = None,
    ) -> list[Path]:
        """Export multiple panels.

        Args:
            image_paths: List of paths to source images.
            output_name: Base name for output files.
            options: Export options.

        Returns:
            List of paths to exported files.
        """
        if options is None:
            options = ExportOptions()

        exported: list[Path] = []

        if options.format == "pdf":
            pdf_path = self._export_pdf(image_paths, output_name, options)
            exported.append(pdf_path)
        else:
            for i, image_path in enumerate(image_paths):
                name = f"{output_name}_{i + 1}"
                exported_path = self._export_image(image_path, name, options)
                exported.append(exported_path)

        return exported

    def export_to_csv(
        self,
        metadata: list[dict[str, Any]],
        output_name: str,
    ) -> Path:
        """Export panel metadata to CSV.

        Args:
            metadata: List of panel metadata dictionaries.
            output_name: Base name for the output file.

        Returns:
            Path to the exported CSV file.
        """
        output_path = self.output_dir / f"{output_name}.csv"

        if not metadata:
            logger.warning("No metadata to export")
            return output_path

        # Get all unique keys from metadata
        fieldnames: set[str] = set()
        for item in metadata:
            fieldnames.update(item.keys())
        fieldnames_list = sorted(fieldnames)

        try:
            with open(output_path, "w", newline="", encoding="utf-8") as f:
                writer = csv.DictWriter(f, fieldnames=fieldnames_list)
                writer.writeheader()
                writer.writerows(metadata)
        except OSError as e:
            raise ExportError(f"Failed to write CSV: {e}") from e

        return output_path

    def _export_image(
        self,
        image_path: Path,
        output_name: str,
        options: ExportOptions,
    ) -> Path:
        """Export an image in the specified format.

        Args:
            image_path: Path to the source image.
            output_name: Base name for the output file.
            options: Export options.

        Returns:
            Path to the exported file.
        """
        try:
            image = Image.open(image_path)

            # Determine format
            fmt = options.format.upper()
            if fmt == "JPEG":
                fmt = "JPEG"

            # Build output path
            ext = f".{options.format}"
            output_path = self.output_dir / f"{output_name}{ext}"

            # Calculate quality and lossless settings
            quality = options.quality if fmt != "PNG" else None
            lossless = options.lossless if fmt in ("WEBP", "PNG") else None

            # Save image
            image.save(
                output_path,
                format=fmt,
                quality=quality,
                lossless=lossless,
            )

            return output_path

        except OSError as e:
            raise ExportError(f"Failed to export image: {e}") from e

    def _export_pdf(
        self,
        image_paths: list[Path],
        output_name: str,
        options: ExportOptions,
        panel_notes: dict[int, str] | None = None,
    ) -> Path:
        """Export panels to a PDF document with grid layout.

        Args:
            image_paths: List of paths to source images.
            output_name: Base name for the output file.
            options: Export options.
            panel_notes: Optional dictionary mapping panel index to notes text.

        Returns:
            Path to the exported PDF file.
        """
        try:
            from reportlab.lib.pagesizes import letter, landscape
            from reportlab.pdfgen import canvas
            from reportlab.lib.units import inch
        except ImportError:
            raise ExportError(
                "ReportLab is required for PDF export. "
                "Install it with: pip install reportlab"
            )

        output_path = self.output_dir / f"{output_name}.pdf"

        # Get grid settings
        cols = options.pdf_grid_cols
        rows = options.pdf_grid_rows
        panels_per_page = cols * rows

        # Use landscape for wider grids
        if cols > rows:
            pagesize = landscape(letter)
        else:
            pagesize = letter
        
        width, height = pagesize

        # Create PDF
        c = canvas.Canvas(str(output_path), pagesize=pagesize)

        # Calculate margins and spacing
        margin = 0.5 * inch
        spacing = 0.25 * inch
        note_height = 0.4 * inch if options.include_notes else 0

        # Calculate available space for grid
        available_width = width - (2 * margin) - ((cols - 1) * spacing)
        available_height = height - (2 * margin) - ((rows - 1) * spacing) - (rows * note_height)

        # Calculate cell size
        cell_width = available_width / cols
        cell_height = available_height / rows

        # Process images in batches per page
        temp_files = []
        try:
            for page_start in range(0, len(image_paths), panels_per_page):
                page_images = image_paths[page_start:page_start + panels_per_page]

                for i, image_path in enumerate(page_images):
                    try:
                        img = Image.open(image_path)
                        img_width, img_height = img.size

                        # Calculate position in grid
                        col = i % cols
                        row = i // cols

                        # Calculate cell position (top-left origin, but PDF is bottom-left)
                        cell_x = margin + col * (cell_width + spacing)
                        cell_y = height - margin - (row + 1) * (cell_height + note_height) - row * spacing

                        # Calculate scale to fit cell while maintaining aspect ratio
                        scale = min(cell_width / img_width, cell_height / img_height)
                        draw_width = img_width * scale
                        draw_height = img_height * scale

                        # Center image in cell
                        x = cell_x + (cell_width - draw_width) / 2
                        y = cell_y + (cell_height - draw_height) / 2 + note_height

                        # Save temp file and draw
                        temp_path = self.output_dir / f"temp_{page_start + i}_{image_path.stem}.png"
                        img.save(temp_path, format="PNG")
                        temp_files.append(temp_path)

                        # Draw border
                        c.setStrokeColorRGB(0.3, 0.3, 0.3)
                        c.setLineWidth(0.5)
                        c.rect(cell_x, cell_y + note_height, cell_width, cell_height)

                        # Draw image
                        c.drawImage(
                            str(temp_path),
                            x,
                            y,
                            width=draw_width,
                            height=draw_height,
                        )

                        # Draw panel number
                        panel_num = page_start + i + 1
                        c.setFillColorRGB(0.4, 0.4, 0.4)
                        c.setFont("Helvetica-Bold", 8)
                        c.drawString(cell_x + 4, cell_y + cell_height + note_height - 12, f"Panel {panel_num}")

                        # Draw notes if enabled
                        if options.include_notes and panel_notes:
                            note_text = panel_notes.get(page_start + i, "")
                            if note_text:
                                c.setFillColorRGB(0.2, 0.2, 0.2)
                                c.setFont("Helvetica", 7)
                                # Truncate long notes
                                max_chars = int(cell_width / 4)
                                if len(note_text) > max_chars:
                                    note_text = note_text[:max_chars - 3] + "..."
                                c.drawString(cell_x + 4, cell_y + note_height - 12, note_text)

                    except Exception as e:
                        logger.error(f"Failed to add {image_path} to PDF: {e}")

                c.showPage()  # New page

            c.save()

        finally:
            # Clean up temp files
            for temp_path in temp_files:
                try:
                    temp_path.unlink()
                except Exception:
                    pass

        return output_path

    def _export_pdf_single(
        self,
        image_paths: list[Path],
        output_name: str,
        options: ExportOptions,
    ) -> Path:
        """Export panels to PDF with one image per page (legacy mode).

        Args:
            image_paths: List of paths to source images.
            output_name: Base name for the output file.
            options: Export options.

        Returns:
            Path to the exported PDF file.
        """
        try:
            from reportlab.lib.pagesizes import letter
            from reportlab.pdfgen import canvas
        except ImportError:
            raise ExportError(
                "ReportLab is required for PDF export. "
                "Install it with: pip install reportlab"
            )

        output_path = self.output_dir / f"{output_name}.pdf"
        c = canvas.Canvas(str(output_path), pagesize=letter)
        width, height = letter

        for image_path in image_paths:
            try:
                img = Image.open(image_path)
                img_width, img_height = img.size
                max_width = width - 72 * 2
                max_height = height - 72 * 2
                scale = min(max_width / img_width, max_height / img_height)
                draw_width = img_width * scale
                draw_height = img_height * scale
                x = (width - draw_width) / 2
                y = (height - draw_height) / 2

                temp_path = self.output_dir / f"temp_{image_path.stem}.png"
                img.save(temp_path, format="PNG")
                c.drawImage(str(temp_path), x, y, width=draw_width, height=draw_height)
                c.showPage()
                temp_path.unlink()
            except Exception as e:
                logger.error(f"Failed to add {image_path} to PDF: {e}")

        c.save()
        return output_path

    def get_format_options(self, format_name: str) -> ExportOptions:
        """Get default options for a specific format.

        Args:
            format_name: Format identifier.

        Returns:
            ExportOptions with appropriate defaults.
        """
        if format_name == "png":
            return ExportOptions(format="png", lossless=True, quality=100)
        elif format_name == "jpeg":
            return ExportOptions(format="jpeg", lossless=False, quality=95)
        elif format_name == "webp":
            return ExportOptions(format="webp", lossless=False, quality=90)
        elif format_name == "csv":
            return ExportOptions(format="csv")
        else:
            return ExportOptions(format="png")

    def validate_output_path(self, path: Path) -> bool:
        """Validate that an output path is writable.

        Args:
            path: Path to validate.

        Returns:
            True if writable, False otherwise.
        """
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            return True
        except OSError:
            return False

    def export_panel_metadata(
        self,
        panel_info: dict[str, Any],
        output_name: str,
    ) -> Path:
        """Export a single panel's metadata to JSON.

        Args:
            panel_info: Panel metadata dictionary.
            output_name: Base name for the output file.

        Returns:
            Path to the exported JSON file.
        """
        output_path = self.output_dir / f"{output_name}.json"

        try:
            with open(output_path, "w", encoding="utf-8") as f:
                json.dump(panel_info, f, indent=2)
        except OSError as e:
            raise ExportError(f"Failed to write metadata: {e}") from e

        return output_path
